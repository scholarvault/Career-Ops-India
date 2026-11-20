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
// The window is real and headed (Cloudflare and Akamai both refuse headless),
// but it is parked off-screen: the user sees it inside Career-Ops, not as a
// stray window on the desktop.

import { chromium, type BrowserContext, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

export const HAS_CHROME = Boolean(CHROME);

/** One context per profile directory. Naukri and Indeed keep separate
 *  profiles on purpose: a Cloudflare clearance cookie and a Naukri session
 *  should not be able to invalidate each other. */
const contexts = new Map<string, BrowserContext>();
const opening = new Map<string, Promise<BrowserContext>>();

export async function getContext(profileDir: string): Promise<BrowserContext> {
  const key = profileDir;
  const existing = contexts.get(key);
  if (existing) return existing;

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
      ],
    });
    contexts.set(key, ctx);
    ctx.on("close", () => {
      if (contexts.get(key) === ctx) contexts.delete(key);
    });
    return ctx;
  })();

  opening.set(key, p);
  try {
    return await p;
  } finally {
    opening.delete(key);
  }
}

/** Borrow a tab, then close only the tab. The browser stays warm. */
export async function withPage<T>(profileDir: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const ctx = await getContext(profileDir);
  const page = await ctx.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

/** The tab the user is looking at inside the app, and the context it belongs
 *  to. Naukri and Indeed have separate profiles, so a tab from one must never
 *  be reused for the other. */
let visiblePage: Page | null = null;
let visibleCtx: BrowserContext | null = null;

export async function openVisible(profileDir: string, url: string): Promise<{ ok: boolean; url?: string; title?: string; message?: string }> {
  if (!CHROME) return { ok: false, message: "Chrome or Edge was not found on this machine." };
  try {
    const ctx = await getContext(profileDir);
    if (!visiblePage || visiblePage.isClosed() || visibleCtx !== ctx) {
      visiblePage = await ctx.newPage();
      visibleCtx = ctx;
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

export async function frame(): Promise<Buffer | null> {
  const p = currentPage();
  if (!p) return null;
  try {
    return await p.screenshot({ type: "jpeg", quality: 72, animations: "disabled" });
  } catch {
    return null;
  }
}

export async function navigate(url: string): Promise<{ ok: boolean; url?: string; title?: string; message?: string }> {
  const p = currentPage();
  if (!p) return { ok: false, message: "The browser is not open." };
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
  for (const [key, ctx] of contexts) {
    await ctx.close().catch(() => {});
    contexts.delete(key);
  }
  visiblePage = null;
  visibleCtx = null;
}

export function defaultProfile(root: string): string {
  return join(root, "data", "browser-profile");
}
