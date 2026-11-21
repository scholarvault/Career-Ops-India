// One Chrome, owned by Career-Ops.
//
// Every browser-backed source used to launch its own window and close it
// again. That meant two windows at once, a profile directory that could only
// be used by one of them, and a sign-in the user had to repeat. This module
// owns a single persistent context instead:
//
//   - the connectors borrow a tab with `withPage` and close only the tab;
//   - the user gets the same browser streamed into the app (`/api/browser/*`),
//     so a sign-in happens once and every later search reuses it.
//
// The window is real and headed, because Indeed and LinkedIn sit behind
// Cloudflare and refuse headless. Naukri does not (plain nginx), so it is
// served over its own JSON API instead and never needs a browser at all.
//
// Memory is the real constraint on a 14 GB laptop, so the context is not kept
// warm forever: it closes itself after a quiet spell and reopens on the next
// request. Cookies live on disk, so a sign-in survives the close.

import { chromium, type BrowserContext, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

export const CHROME_PATH = CHROME;
export const HAS_CHROME = Boolean(CHROME);

/** One context per profile directory. Naukri and Indeed keep separate
 *  profiles on purpose: a Cloudflare clearance cookie and a Naukri session
 *  should not be able to invalidate each other. */
const contexts = new Map<string, BrowserContext>();
const opening = new Map<string, Promise<BrowserContext>>();

/** The tab the user is looking at inside the app, and the context it belongs
 *  to. Naukri and Indeed have separate profiles, so a tab from one must never
 *  be reused for the other. */
let visiblePage: Page | null = null;
let visibleCtx: BrowserContext | null = null;
let visibleKey: string | null = null;

/* A headed Chromium costs roughly half a gigabyte per profile, and this app
   can open two. Left alone it stays up for the whole session, so an idle
   laptop carried a gigabyte of browser doing nothing. Close it after a quiet
   spell instead; the profile directory keeps the cookies, so the next request
   reopens the same signed-in session. Set CAREER_OPS_BROWSER_IDLE_MS=0 to
   keep the old always-warm behaviour. */
const IDLE_MS = Number(process.env.CAREER_OPS_BROWSER_IDLE_MS ?? 10 * 60_000);
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
/* A connector may hold a tab for longer than the idle window (a slow board, a
   retry). Never close a context that is mid-job. */
const busy = new Set<string>();

function touch(key: string): void {
  const t = idleTimers.get(key);
  if (t) clearTimeout(t);
  idleTimers.delete(key);
  if (!IDLE_MS || !contexts.has(key)) return;
  idleTimers.set(key, setTimeout(() => { void retire(key); }, IDLE_MS));
}

async function retire(key: string): Promise<void> {
  idleTimers.delete(key);
  const ctx = contexts.get(key);
  if (!ctx) return;
  /* The user may be part-way through a sign-in with the panel open. The panel
     polls /api/browser/frame, which touches the timer, so this only fires when
     nobody is looking at it. */
  if (busy.has(key)) {
    touch(key);
    return;
  }
  if (visibleCtx === ctx && visiblePage && !visiblePage.isClosed()) {
    touch(key);
    return;
  }
  contexts.delete(key);
  await ctx.close().catch(() => {});
}

export async function getContext(profileDir: string): Promise<BrowserContext> {
  const key = profileDir;
  const existing = contexts.get(key);
  if (existing) {
    touch(key);
    return existing;
  }

  const pending = opening.get(key);
  if (pending) return pending;

  if (!CHROME) throw new Error("Chrome or Edge was not found on this machine.");

  const p = (async () => {
    const ctx = await chromium.launchPersistentContext(profileDir, {
      executablePath: CHROME,
      headless: false,
      viewport: { width: 1280, height: 800 },
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      args: [
        "--disable-blink-features=AutomationControlled",
        /* parked off-screen: the user sees this browser inside the app */
        "--window-position=-32000,-32000",
        "--window-size=1280,800",
        /* No launch flags beyond these. Measured on this machine: the usual
           "lean" set (--disable-background-networking, --no-first-run,
           --disable-sync, ...) is already passed by Playwright, so adding it
           changed nothing, and --renderer-process-limit=1 saved 76 MB on a
           blank page but nothing on a real one, while making every tab share
           one renderer. Not worth a crash taking the sign-in page with it. */
      ],
    });
    contexts.set(key, ctx);
    ctx.on("close", () => {
      if (contexts.get(key) === ctx) contexts.delete(key);
      const t = idleTimers.get(key);
      if (t) {
        clearTimeout(t);
        idleTimers.delete(key);
      }
    });
    touch(key);
    return ctx;
  })();

  opening.set(key, p);
  try {
    return await p;
  } finally {
    opening.delete(key);
  }
}

/* Job boards load a dozen ad and analytics bundles per page. They cost real
   memory and they bury the posting text the connectors are trying to read.
   Measured on Indeed + LinkedIn: 1,185 MB with them, 1,004 MB without, and
   Indeed yielded more text, not less.

   Only background tabs get this. The page the user signs in on is left
   untouched, because a challenge or an auth widget living on another domain
   must be allowed to run. */
const ALLOW_3P = [
  "cloudflare.com",
  "cloudflareinsights.com",
  "challenges.cloudflare.com",
  "google.com",
  "gstatic.com",
  "recaptcha.net",
  "hcaptcha.com",
  "arkoselabs.com",
  "funcaptcha.com",
  "auth0.com",
  "okta.com",
  "microsoftonline.com",
  "accounts.google.com",
];

function registrable(host: string): string {
  return host.split(".").slice(-2).join(".");
}

async function blockThirdPartyScripts(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    const req = route.request();
    if (req.resourceType() !== "script") return route.continue();
    let host = "";
    let first = "";
    try {
      host = new URL(req.url()).hostname;
      first = new URL(req.frame()?.url() || "").hostname;
    } catch {
      return route.continue();
    }
    if (!host || !first) return route.continue();
    if (registrable(host) === registrable(first)) return route.continue();
    if (ALLOW_3P.some((d) => host === d || host.endsWith("." + d))) return route.continue();
    return route.abort();
  });
}

/** Borrow a tab, then close only the tab. */
export async function withPage<T>(profileDir: string, fn: (page: Page) => Promise<T>): Promise<T> {
  if (paused) {
    throw new Error("You have control of the browser. Hand it back before a run can start.");
  }
  const ctx = await getContext(profileDir);
  busy.add(profileDir);
  const page = await ctx.newPage();
  await blockThirdPartyScripts(page).catch(() => {});
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
    busy.delete(profileDir);
    touch(profileDir);
  }
}

export async function openVisible(profileDir: string, url: string): Promise<{ ok: boolean; url?: string; title?: string; message?: string }> {
  if (!CHROME) return { ok: false, message: "Chrome or Edge was not found on this machine." };
  try {
    const ctx = await getContext(profileDir);
    if (!visiblePage || visiblePage.isClosed() || visibleCtx !== ctx) {
      visiblePage = await ctx.newPage();
      visibleCtx = ctx;
      visibleKey = profileDir;
      /* A site that opens a new tab (Naukri's Login does) must take over the
         panel, otherwise the user clicks and nothing appears to happen. This
         is attached to the visible page only, so a background discovery tab
         can never steal the panel. */
      visiblePage.on("popup", (p) => {
        visiblePage = p;
      });
    }
    await visiblePage.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await visiblePage.bringToFront().catch(() => {});
    return { ok: true, url: visiblePage.url(), title: await visiblePage.title().catch(() => "") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export function currentPage(): Page | null {
  return visiblePage && !visiblePage.isClosed() ? visiblePage : null;
}

/* ------------------------------------------------------------------ */
/* handoff                                                             */
/* ------------------------------------------------------------------ */

/* "Take control" is not decoration: while the user has control, no connector
   may drive the page. A background discovery tab clicking through a form the
   user is filling is the one bug that makes a tool untrustworthy. */
let paused = false;

export function setPaused(value: boolean): void {
  paused = value;
}

export function isPaused(): boolean {
  return paused;
}

export type PageState = {
  url: string;
  title: string;
  /** First ~260 characters of visible text, whitespace collapsed. */
  text: string;
  /** What the page is asking the user for, if anything. */
  needs: "otp" | "password" | "captcha" | "consent" | "form" | null;
  /** One sentence to show above the live view. */
  reason?: string;
};

/**
 * A compact read of what the page is doing, so the panel can say "Naukri is
 * asking for an OTP" instead of showing a frozen screenshot. Read-only and
 * cheap: one evaluate, no navigation.
 *
 * Passed as a string: this file is compiled without the DOM lib, and the code
 * runs in the page, not in Node.
 */
const STATE_JS = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const body = (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").trim();
  const otp = Array.from(document.querySelectorAll('input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i]')).some(visible);
  const password = Array.from(document.querySelectorAll('input[type="password"]')).some(visible);
  const frames = Array.from(document.querySelectorAll("iframe")).map((f) => f.src || "");
  const captcha = frames.some((s) => /recaptcha|hcaptcha|turnstile|arkose|funcaptcha/i.test(s))
    || /verify you are human|i'm not a robot|complete the captcha/i.test(body);
  const consent = /accept (all )?cookies|manage (your )?preferences/i.test(body) && body.length < 1200;
  const form = Array.from(document.querySelectorAll("form")).some(visible);
  return { body: body.slice(0, 260), otp, password, captcha, consent, form, url: location.href, title: document.title };
})()`;

type RawState = {
  body: string;
  otp: boolean;
  password: boolean;
  captcha: boolean;
  consent: boolean;
  form: boolean;
  url: string;
  title: string;
};

export async function pageState(): Promise<PageState | null> {
  const p = currentPage();
  if (!p) return null;
  if (visibleKey) touch(visibleKey);
  try {
    const raw = (await p.evaluate(STATE_JS)) as RawState;
    const needs: PageState["needs"] = raw.otp
      ? "otp"
      : raw.captcha
        ? "captcha"
        : raw.password
          ? "password"
          : raw.consent
            ? "consent"
            : raw.form
              ? "form"
              : null;
    const reason =
      needs === "otp" ? "This page is asking for a one-time code. Enter it here and the run continues."
      : needs === "captcha" ? "A bot check is on screen. Solve it yourself — we never bypass one."
      : needs === "password" ? "This page wants a password. Type it here; it is never read or stored."
      : needs === "consent" ? "The site is asking for cookie consent. Choose, then hand back."
      : undefined;
    return {
      url: raw.url,
      title: raw.title,
      text: raw.body,
      needs,
      ...(reason ? { reason } : {}),
    };
  } catch {
    return null;
  }
}

export async function frame(): Promise<Buffer | null> {
  const p = currentPage();
  if (!p) return null;
  /* The panel polls this while it is on screen, so a user reading a page or
     part-way through a sign-in keeps the browser alive without doing
     anything. */
  if (visibleKey) touch(visibleKey);
  try {
    return await p.screenshot({ type: "jpeg", quality: 72, animations: "disabled" });
  } catch {
    return null;
  }
}

export async function navigate(url: string): Promise<{ ok: boolean; url?: string; title?: string; message?: string }> {
  const p = currentPage();
  if (!p) return { ok: false, message: "The browser is not open." };
  if (visibleKey) touch(visibleKey);
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    return { ok: true, url: p.url(), title: await p.title().catch(() => "") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function back(): Promise<{ ok: boolean; url?: string }> {
  const p = currentPage();
  if (!p) return { ok: false };
  if (visibleKey) touch(visibleKey);
  await p.goBack({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  return { ok: true, url: p.url() };
}

export type Input =
  | { kind: "click"; x: number; y: number; button?: "left" | "right" }
  | { kind: "move"; x: number; y: number }
  | { kind: "type"; text: string }
  | { kind: "key"; key: string }
  | { kind: "scroll"; x: number; y: number; dy: number }
  | { kind: "scrollTop" }
  | { kind: "resize"; width: number; height: number };

export async function sendInput(input: Input): Promise<{ ok: boolean; message?: string }> {
  const p = currentPage();
  if (!p) return { ok: false, message: "The browser is not open." };
  if (visibleKey) touch(visibleKey);
  try {
    switch (input.kind) {
      case "click":
        await p.mouse.click(input.x, input.y, { button: input.button ?? "left" });
        break;
      case "move":
        await p.mouse.move(input.x, input.y);
        break;
      case "type":
        await p.keyboard.type(input.text, { delay: 12 });
        break;
      case "key":
        await p.keyboard.press(input.key);
        break;
      case "scroll":
        await p.mouse.move(input.x, input.y);
        await p.mouse.wheel(0, input.dy);
        break;
      case "scrollTop":
        /* Filling a form scrolls each field into view, so the panel lands at
           the bottom. After a fill the user should see the top of the form. */
        await p.evaluate("window.scrollTo({ top: 0, behavior: 'instant' })").catch(() => {});
        break;
      case "resize":
        await p.setViewportSize({
          width: Math.max(320, Math.min(1920, input.width)),
          height: Math.max(320, Math.min(1400, input.height)),
        });
        break;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function closeBrowser(): Promise<void> {
  for (const t of idleTimers.values()) clearTimeout(t);
  idleTimers.clear();
  busy.clear();
  for (const [key, ctx] of contexts) {
    await ctx.close().catch(() => {});
    contexts.delete(key);
  }
  visiblePage = null;
  visibleCtx = null;
  visibleKey = null;
}

/**
 * Read cookies for one site out of a profile, without navigating anywhere.
 *
 * This is how the API connector borrows a sign-in the user already did in the
 * browser panel: the human clears the password and the captcha once, and the
 * token is reused from the same jar. Nothing is decrypted by hand — Chrome's
 * cookie store is encrypted per-user, so Playwright is the only honest reader.
 *
 * If the app's browser is already open we read from it; otherwise a headless
 * context is opened on the same profile just long enough to read the jar. A
 * headless launch is fine here because no page is loaded, so there is nothing
 * for Akamai or Cloudflare to judge.
 */
export async function readCookies(
  profileDir: string,
  hostSuffix: string,
): Promise<Array<{ name: string; value: string; domain: string }>> {
  const live = contexts.get(profileDir);
  if (live) {
    const all = await live.cookies();
    return all.filter((c) => c.domain.replace(/^\./, "").endsWith(hostSuffix));
  }

  if (!CHROME) throw new Error("Chrome or Edge was not found on this machine.");

  const ctx = await chromium.launchPersistentContext(profileDir, {
    executablePath: CHROME,
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  try {
    const all = await ctx.cookies();
    return all.filter((c) => c.domain.replace(/^\./, "").endsWith(hostSuffix));
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function defaultProfile(root: string): string {
  return join(root, "data", "browser-profile");
}
