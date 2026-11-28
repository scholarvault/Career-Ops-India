/* Your own Chrome, Brave or Edge, for the job sites you choose (ADR-032).
 *
 * Some sites refuse the app's browser even when it is honest about being
 * automated. Your everyday browser is already signed in and is plainly you,
 * so those sites treat it as you. This attaches to it over the Chrome
 * DevTools Protocol, the same channel the app's own browser uses, through
 * Playwright's connectOverCDP:
 *
 *   1. You turn on remote debugging once, in your browser, at
 *      chrome://inspect/#remote-debugging (brave:// and edge:// work too).
 *      The browser writes DevToolsActivePort into its profile folder.
 *   2. Connect reads that file and attaches. The browser asks you to allow
 *      it; nothing attaches without that click.
 *   3. Only the sites you tick go through it, and only in tabs the app opens.
 *      The app never reads, moves or closes a tab of yours, never reads a
 *      saved password, and never copies your profile or cookies anywhere.
 *   4. It disconnects after 15 quiet minutes, and on Disconnect, closing only
 *      the tabs it opened. While attached, any program on this computer could
 *      also drive the browser through the same port, so it is never left on.
 *
 * A captcha or bot check is still yours to pass (AGENTS.md).
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const USER_BROWSER = "@user-browser";
export type UserBrowserId = "chrome" | "brave" | "edge";

const isWin = process.platform === "win32";
const local = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
const macSupport = join(homedir(), "Library", "Application Support");

/* Where each browser keeps its profile, and so its DevToolsActivePort file.
   CAREER_OPS_USER_BROWSER_DIR points at another folder (tests use a scratch one). */
function dirs(): Record<UserBrowserId, { name: string; dir: string }> {
  const o = process.env.CAREER_OPS_USER_BROWSER_DIR;
  const pick = (win: string, mac: string, linux: string) => (isWin ? win : process.platform === "darwin" ? mac : linux);
  return {
    chrome: { name: "Chrome", dir: o || pick(join(local, "Google", "Chrome", "User Data"), join(macSupport, "Google", "Chrome"), join(homedir(), ".config", "google-chrome")) },
    brave: { name: "Brave", dir: pick(join(local, "BraveSoftware", "Brave-Browser", "User Data"), join(macSupport, "BraveSoftware", "Brave-Browser"), join(homedir(), ".config", "BraveSoftware", "Brave-Browser")) },
    edge: { name: "Edge", dir: pick(join(local, "Microsoft", "Edge", "User Data"), join(macSupport, "Microsoft Edge"), join(homedir(), ".config", "microsoft-edge")) },
  };
}

type Config = { browser?: UserBrowserId; sites: Array<{ id: string; host: string }> };
let config: Config = { sites: [] };
let configFile = "";

let browser: Browser | null = null;
let ctx: BrowserContext | null = null;
let attachedAs: UserBrowserId | null = null;
const ours = new Set<Page>();
let idle: ReturnType<typeof setTimeout> | null = null;
const IDLE_MS = 15 * 60_000;

export async function loadUserBrowserConfig(dataDir: string): Promise<Config> {
  configFile = join(dataDir, "user-browser.json");
  try {
    const raw = JSON.parse(await readFile(configFile, "utf8")) as Partial<Config>;
    config = { browser: raw.browser, sites: Array.isArray(raw.sites) ? raw.sites.filter((s) => s && s.id && s.host) : [] };
  } catch { config = { sites: [] }; }
  return config;
}

export async function saveUserBrowserConfig(dataDir: string, next: Config): Promise<Config> {
  configFile = join(dataDir, "user-browser.json");
  config = { ...(next.browser ? { browser: next.browser } : {}), sites: next.sites };
  await mkdir(dataDir, { recursive: true });
  await writeFile(configFile, JSON.stringify(config, null, 2), "utf8");
  return config;
}

/** Each browser on this machine, and whether remote debugging is on in it now. */
export function detectUserBrowsers(): Array<{ id: UserBrowserId; name: string; installed: boolean; debugging: boolean }> {
  return (Object.entries(dirs()) as Array<[UserBrowserId, { name: string; dir: string }]>).map(([id, d]) => ({
    id,
    name: d.name,
    installed: existsSync(d.dir),
    debugging: existsSync(join(d.dir, "DevToolsActivePort")),
  }));
}

function touch(): void {
  if (idle) clearTimeout(idle);
  idle = browser ? setTimeout(() => { void detachUserBrowser(); }, IDLE_MS) : null;
}

export async function attachUserBrowser(id: UserBrowserId): Promise<{ ok: boolean; message: string }> {
  const d = dirs()[id];
  if (!d) return { ok: false, message: "Unknown browser." };
  if (browser && attachedAs === id) { touch(); return { ok: true, message: `${d.name} is connected.` }; }
  if (browser) await detachUserBrowser();
  let port = "", path = "";
  try {
    [port = "", path = ""] = (await readFile(join(d.dir, "DevToolsActivePort"), "utf8")).split(/\r?\n/);
  } catch {
    return { ok: false, message: `Remote debugging is off in ${d.name}. Open ${id === "edge" ? "edge" : id === "brave" ? "brave" : "chrome"}://inspect/#remote-debugging there, turn it on, then press Connect again.` };
  }
  if (!/^\d+$/.test(port.trim())) return { ok: false, message: `${d.name} wrote an unreadable debugging file. Restart ${d.name} and try again.` };
  const endpoint = `ws://127.0.0.1:${port.trim()}${path.trim() || "/devtools/browser"}`;
  try {
    /* the browser shows its own "Allow remote debugging?" prompt; wait for the click */
    browser = await chromium.connectOverCDP(endpoint, { timeout: 60_000 });
  } catch (e) {
    browser = null;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: /ECONNREFUSED|closed|404/.test(msg) ? `${d.name} is not running with remote debugging. Open ${d.name}, check chrome://inspect/#remote-debugging is on, and try again.` : /Timeout/i.test(msg) ? `${d.name} did not allow the connection in time. Press Connect and click Allow in ${d.name}.` : `Could not attach to ${d.name}: ${msg.slice(0, 140)}` };
  }
  ctx = browser.contexts()[0] ?? null;
  if (!ctx) { await browser.close().catch(() => {}); browser = null; return { ok: false, message: `${d.name} has no open window to work in.` }; }
  attachedAs = id;
  ctx.on("page", () => touch());
  browser.on("disconnected", () => { browser = null; ctx = null; attachedAs = null; ours.clear(); if (idle) clearTimeout(idle); idle = null; });
  touch();
  if (config.browser !== id && configFile) await saveUserBrowserConfig(dirname(configFile), { ...config, browser: id }).catch(() => {});
  return { ok: true, message: `Connected to ${d.name}. Only the sites you tick go through it, in tabs the app opens.` };
}

export async function detachUserBrowser(): Promise<void> {
  const b = browser;
  for (const p of ours) await p.close().catch(() => {});
  ours.clear();
  if (idle) clearTimeout(idle);
  idle = null;
  browser = null; ctx = null; attachedAs = null;
  /* for a connectOverCDP browser, close() disconnects; your browser stays open */
  if (b) await b.close().catch(() => {});
}

/** The attached browser's context, for browser.ts. Every tab the app opens in it is recorded. */
export function userContext(): BrowserContext {
  if (!ctx || !browser) throw new Error("Your browser is not connected. Connect it in Settings → Job sites, or untick “Use my browser” for this site.");
  touch();
  return ctx;
}
export function markOurs(page: Page): void {
  ours.add(page);
  page.on("close", () => ours.delete(page));
}

export function userBrowserState(): { connected: boolean; browser: UserBrowserId | null; name: string | null; sites: string[]; preferred?: UserBrowserId } {
  return {
    connected: Boolean(browser),
    browser: attachedAs,
    name: attachedAs ? dirs()[attachedAs].name : null,
    sites: config.sites.map((s) => s.id),
    ...(config.browser ? { preferred: config.browser } : {}),
  };
}

/** For a URL on a site the user routed through their browser, the profile key to use. */
export function routeFor(url: string): string | null {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const hit = config.sites.find((s) => host === s.host || host.endsWith("." + s.host));
  /* not attached right now: the Career-Ops window does it instead of failing */
  return hit && browser ? USER_BROWSER : null;
}
