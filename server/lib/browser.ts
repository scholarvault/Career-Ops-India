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
import { USER_BROWSER, markOurs, userContext } from "./user-browser";

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

/* ------------------------------------------------------------------ */
/* window mode                                                         */
/* ------------------------------------------------------------------ */

/**
 * How the one browser shows itself, per profile.
 *
 *   headless  - no window at all. Screenshots and input still work, so the
 *               in-app panel (ui/browser.html) shows the page and the user can
 *               clear a captcha or type a password there. Default for the
 *               main profile: employer ATS forms (Lever, Greenhouse, Ashby,
 *               SmartRecruiters) and Naukri sign-in do not need a window.
 *   offscreen - a real window parked off every monitor. For Indeed and
 *               Workday, which refuse a headless browser. We do not disguise
 *               headless as headed (ADR-004); we just use a headed browser.
 *   window    - a normal, visible window. The user's choice when a site
 *               will not cooperate with either of the above.
 *
 * CAREER_OPS_BROWSER_MODE=headless|offscreen|window overrides "auto" for
 * every profile; setMode() overrides it for one profile at run time.
 */
export type BrowserMode = "headless" | "offscreen" | "window";
const modeOverride = new Map<string, BrowserMode>();
const launchedMode = new Map<string, BrowserMode>();

export function modeFor(profileDir: string): BrowserMode {
  const o = modeOverride.get(profileDir);
  if (o) return o;
  const env = String(process.env.CAREER_OPS_BROWSER_MODE || "auto").toLowerCase();
  if (env === "headless" || env === "offscreen" || env === "window") return env;
  /* ADR-033: a real headed browser, parked off-screen, for every profile.
     Sites treat it as a browser (foundit, Naukri, Indeed refused headless),
     and when the user is needed it is moved on-screen as a sharp, native
     window instead of being streamed as screenshots. */
  return "offscreen";
}

/* ------------------------------------------------------------------ */
/* the window: shown when the user is needed, parked when not           */
/* ------------------------------------------------------------------ */

async function windowOf(page: Page): Promise<{ s: import("playwright-core").CDPSession; id: number } | null> {
  try {
    const s = await page.context().newCDPSession(page);
    const { windowId } = (await s.send("Browser.getWindowForTarget")) as { windowId: number };
    return { s, id: windowId };
  } catch {
    return null;
  }
}

/**
 * Bring the app's browser on-screen, centred, at the page the user needs:
 * a sign-in, an OTP, a captcha, a form to review. It is a real window, so
 * text is sharp, paste and the keyboard are native, and the user solves a
 * check themselves (AGENTS.md). Headless has no window; it is relaunched
 * off-screen first (cookies are on disk, so nothing is lost).
 */
export async function showWindow(profileDir?: string): Promise<{ ok: boolean; message?: string; url?: string }> {
  let page = currentPage();
  const key = profileDir || visibleKey || "";
  if (!page && !key) return { ok: false, message: "Nothing is open in the browser yet." };
  if (key && key !== "@user-browser" && launchedMode.get(key) === "headless") {
    const r = await setMode(key, "offscreen");
    if (!r.ok) return { ok: false, message: r.message };
    page = currentPage();
  }
  if (!page) return { ok: false, message: "Nothing is open in the browser yet." };
  const w = await windowOf(page);
  if (!w) return { ok: false, message: "This browser has no window to show." };
  try {
    const scr = (await page.evaluate("({ w: screen.availWidth, h: screen.availHeight, x: screen.availLeft || 0, y: screen.availTop || 0 })").catch(() => null)) as { w: number; h: number; x: number; y: number } | null;
    const W = Math.min(1280, Math.max(900, Math.round((scr?.w || 1440) * 0.8)));
    const H = Math.min(900, Math.max(640, Math.round((scr?.h || 900) * 0.86)));
    const left = Math.max(0, Math.round((scr?.x || 0) + ((scr?.w || 1440) - W) / 2));
    const top = Math.max(0, Math.round((scr?.y || 0) + ((scr?.h || 900) - H) / 2));
    await w.s.send("Browser.setWindowBounds", { windowId: w.id, bounds: { windowState: "normal" } }).catch(() => {});
    await w.s.send("Browser.setWindowBounds", { windowId: w.id, bounds: { left, top, width: W, height: H } });
    await page.bringToFront().catch(() => {});
    shown = true;
    return { ok: true, url: page.url() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    await w.s.detach().catch(() => {});
  }
}

/**
 * Show one tab (a connector's own, mid-search) to the user: its window comes
 * on-screen, centred, and the tab to the front. For a check the user must pass
 * while a search waits (ADR-036). hidePage() parks it after.
 */
export async function showPage(page: Page): Promise<boolean> {
  const w = await windowOf(page);
  if (!w) return false;
  try {
    const scr = (await page.evaluate("({ w: screen.availWidth, h: screen.availHeight, x: screen.availLeft || 0, y: screen.availTop || 0 })").catch(() => null)) as { w: number; h: number; x: number; y: number } | null;
    const W = Math.min(1200, Math.round((scr?.w || 1440) * 0.75)), H = Math.min(860, Math.round((scr?.h || 900) * 0.85));
    await w.s.send("Browser.setWindowBounds", { windowId: w.id, bounds: { windowState: "normal" } }).catch(() => {});
    await w.s.send("Browser.setWindowBounds", { windowId: w.id, bounds: { left: Math.round((scr?.x || 0) + ((scr?.w || 1440) - W) / 2), top: Math.round((scr?.y || 0) + ((scr?.h || 900) - H) / 2), width: W, height: H } });
    await page.bringToFront().catch(() => {});
    shown = true;
    return true;
  } catch { return false; } finally { await w.s.detach().catch(() => {}); }
}
export async function hidePage(page: Page): Promise<void> {
  const w = await windowOf(page);
  if (!w) return;
  await w.s.send("Browser.setWindowBounds", { windowId: w.id, bounds: { left: -32000, top: -32000 } }).catch(() => {});
  await w.s.detach().catch(() => {});
  shown = false;
}

/** Park the window off-screen again; the page and the session stay. */
export async function hideWindow(): Promise<{ ok: boolean }> {
  const page = currentPage();
  if (!page || visibleKey === "@user-browser") return { ok: true };
  const w = await windowOf(page);
  if (!w) return { ok: true };
  try {
    await w.s.send("Browser.setWindowBounds", { windowId: w.id, bounds: { left: -32000, top: -32000 } });
  } catch { /* a closed window is hidden enough */ }
  await w.s.detach().catch(() => {});
  shown = false;
  return { ok: true };
}
let shown = false;
export function windowShown(): boolean { return shown; }

export function currentModes(): Array<{ profile: string; mode: BrowserMode; open: boolean }> {
  const keys = new Set([...contexts.keys(), ...modeOverride.keys()]);
  return [...keys].map((k) => ({
    profile: k.replace(/\\/g, "/").split("/").pop() || k,
    mode: launchedMode.get(k) ?? modeFor(k),
    open: contexts.has(k),
  }));
}

/**
 * Switch one profile's mode. The profile directory keeps cookies, so a
 * relaunch keeps every sign-in; the visible page is reopened at its URL.
 * Refused while a connector holds a tab, so a run is never cut in half.
 */
export async function setMode(
  profileDir: string,
  mode: BrowserMode,
): Promise<{ ok: boolean; mode: BrowserMode; url?: string; message?: string }> {
  if (busy.has(profileDir)) {
    return { ok: false, mode: modeFor(profileDir), message: "A run is using this browser. Try again when it pauses." };
  }
  modeOverride.set(profileDir, mode);
  const ctx = contexts.get(profileDir);
  if (!ctx || launchedMode.get(profileDir) === mode) return { ok: true, mode };
  const wasVisible = visibleCtx === ctx && visiblePage && !visiblePage.isClosed() ? visiblePage.url() : "";
  contexts.delete(profileDir);
  await ctx.close().catch(() => {});
  if (visibleCtx === ctx) {
    visiblePage = null;
    visibleCtx = null;
  }
  if (wasVisible && /^https?:/.test(wasVisible)) {
    const r = await openVisible(profileDir, wasVisible);
    return { ok: r.ok, mode, ...(r.url ? { url: r.url } : {}), ...(r.message ? { message: r.message } : {}) };
  }
  return { ok: true, mode };
}

export async function getContext(profileDir: string): Promise<BrowserContext> {
  /* the user's own browser, attached over CDP (user-browser.ts, ADR-032) */
  if (profileDir === USER_BROWSER) return userContext();
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
    const mode = modeFor(profileDir);
    const ctx = await chromium.launchPersistentContext(profileDir, {
      executablePath: CHROME,
      headless: mode === "headless",
      viewport: { width: 1280, height: 800 },
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      args: [
        /* No --disable-blink-features=AutomationControlled: it hides
           navigator.webdriver, which is fingerprint masking (ADR-004,
           ADR-026). A site that refuses an honest automated browser gets a
           human hand-off. Removed 2026-11-28. */
        /* offscreen: parked where no monitor is; the user sees it inside the
           app. window: a normal window, for a site that needs one. */
        ...(mode === "offscreen" ? ["--window-position=-32000,-32000"] : []),
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
    launchedMode.set(key, mode);
    ctx.on("close", () => {
      launchedMode.delete(key);
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
  if (profileDir === USER_BROWSER) markOurs(page);
  else await blockThirdPartyScripts(page).catch(() => {});
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
    busy.delete(profileDir);
    touch(profileDir);
  }
}

export async function openVisible(profileDir: string, url: string): Promise<{ ok: boolean; url?: string; title?: string; message?: string }> {
  if (!CHROME && profileDir !== USER_BROWSER) return { ok: false, message: "Chrome or Edge was not found on this machine." };
  try {
    const ctx = await getContext(profileDir);
    if (!visiblePage || visiblePage.isClosed() || visibleCtx !== ctx) {
      visiblePage = await ctx.newPage();
      if (profileDir === USER_BROWSER) markOurs(visiblePage);
      visibleCtx = ctx;
      visibleKey = profileDir;
      /* A site that opens a new tab (Naukri's Login does) must take over the
         panel, otherwise the user clicks and nothing appears to happen. This
         is attached to the visible page only, so a background discovery tab
         can never steal the panel. */
      visiblePage.on("popup", (p) => {
        visiblePage = p;
        if (profileDir === USER_BROWSER) markOurs(p);
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
  const frameEls = Array.from(document.querySelectorAll("iframe"));
  const captcha = frameEls.some((f) => {
    const s = f.src || "";
    if (!/geo\.captcha-delivery\.com|challenges\.cloudflare\.com|hcaptcha\.com\/captcha|recaptcha\/(?:api2|enterprise)\/bframe|arkose|funcaptcha/i.test(s)) return false;
    if (/frame=enclave|checkbox-invisible/i.test(s)) return false;
    const r = f.getBoundingClientRect();
    return r.width >= 50 && r.height >= 50 && r.left >= 0 && r.top >= 0 && r.top < 3000;
  }) || /verify you are human|i['’]?m not a robot|i am not a robot|complete the captcha/i.test(body);
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
  /* what the user pasted in the app (an email code, a password they copied):
     inserted into the focused field, never logged or stored */
  | { kind: "paste"; text: string }
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
      case "paste":
        await p.keyboard.insertText(String(input.text || "").slice(0, 4000));
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

/**
 * Close any Chrome still holding one of this app's profiles.
 *
 * On Windows a stopped server is killed outright, so its Chrome is orphaned:
 * it keeps running (sometimes as a stray window) and holds the profile lock,
 * and the next launch dies with exit code 21. Called once at server start,
 * when no context of ours can exist yet. It matches only the app's own
 * --user-data-dir under data/, never the user's personal Chrome.
 */
export async function reapOrphanBrowsers(dataDir: string): Promise<number> {
  const { execFileSync } = await import("node:child_process");
  const needle = join(dataDir, "browser-profile");
  try {
    if (process.platform === "win32") {
      const ps =
        "$n = $env:CO_NEEDLE; $k = 0; " +
        "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe'\" | " +
        "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($n) -and $_.CommandLine -notmatch '--type=' } | " +
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $k++ }; $k";
      const out = execFileSync("powershell", ["-NoProfile", "-Command", ps], {
        encoding: "utf8",
        env: { ...process.env, CO_NEEDLE: needle },
        timeout: 15000,
        windowsHide: true,
      });
      return Number(out.trim()) || 0;
    }
    execFileSync("pkill", ["-f", `--user-data-dir=${needle}`], { timeout: 5000 });
    return 1;
  } catch {
    return 0;
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
