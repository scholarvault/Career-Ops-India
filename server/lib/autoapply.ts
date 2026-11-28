// Auto-apply: fill an application and, when the mode allows it, submit it.
//
// The fill half is the existing engine in connectors/fill.ts. This file adds
// the queue, the resume upload, the submit click, the confirmation check and
// the audit log.
//
// Rules that are not negotiable, because they protect the user:
//   - a required field with no answer stops the run; it is never guessed
//   - a captcha is never bypassed; the run pauses and asks
//   - a job already applied to is skipped
//   - every submission is written to data/applications.jsonl
//   - CAREER_OPS_AUTOAPPLY=0 turns submit off

import { routeFor } from "./user-browser";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { currentPage, openVisible, pageState, readCookies as readBrowserCookies } from "./browser";
import {
  detectAll,
  fieldFilled,
  fillByLabel,
  fillFields,
  fillOtp,
  looksLikeApplication,
  needsOtp,
  openForm,
  optionsForLabel,
  type FillProfile,
} from "../connectors/fill";
import {
  applyJob as naukriApplyJob,
  importFromBrowser as naukriImportFromBrowser,
  status as naukriApiStatus,
  applicationHistory as naukriHistory,
  loadSession as naukriLoadSession,
} from "../connectors/naukriApi";
import { actionDelay, pause, serialise } from "./pace";
import { loadTailored, tailoredPdfIsCurrent } from "./tailored";
import {
  ask,
  cancelAll,
  openAsks,
  type AskInput,
  type AskKind,
  type PendingAsk,
} from "./asks";
import {
  flowFrom,
  getSite,
  keyFor,
  lookupAnswer,
  recordAnswer,
  recordOutcome,
  touchSite,
} from "./sites";

export type ApplyMode = "fill" | "submit";

export type QueueJob = {
  id: string;
  title: string;
  company: string;
  source: string;
  applyUrl?: string;
  sourceUrl?: string;
  score?: number;
  location?: string;
  category?: string;
  experienceAsked?: string;
  miss?: string[];
  resumeMode?: "tailored" | "original";
};

export type QueueStatus = "queued" | "filling" | "filled" | "needs" | "submitted" | "failed" | "skipped";

export type QueueItem = QueueJob & {
  status: QueueStatus;
  /** Applied before this run: the site's own record says so. */
  earlier?: boolean;
  message?: string;
  needs?: string;
  fields?: string[];
  filled?: number;
  skipped?: string[];
  confirmation?: string;
  screenshot?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type QueueState = {
  running: boolean;
  paused: boolean;
  mode: ApplyMode;
  items: QueueItem[];
  startedAt?: string;
  finishedAt?: string;
  stop: boolean;
  deferBlocked?: boolean;
  current?: string;
  cap?: number;
  used?: number;
  /** The question the run is waiting on, if any. The console renders it. */
  ask?: PendingAsk | null;
};

type Ctx = { root: string; profileDir: string; profile: FillProfile };

/** Site memory and the audit log live under data/, not the repo root. */
const dataDir = (c: Ctx) => join(c.root, "data");

let state: QueueState = { running: false, paused: false, mode: "fill", items: [], stop: false };
let ctx: Ctx | null = null;

/* ---------- live updates ---------- */

type Listener = (s: QueueState) => void;
const listeners = new Set<Listener>();

/** Subscribe to every queue change. Returns an unsubscribe function. */
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(): void {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* a broken listener must not break the run */
    }
  }
}

const now = () => new Date().toISOString();
const safe = (id: string) => String(id || "job").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
const hostOf = (url: string) => {
  try { return new URL(url).hostname; } catch { return ""; }
};

/* Indeed keeps its own Chrome profile (Cloudflare behaves better isolated), so
   a sign-in done on the Connections page is the one auto-apply finds. */
function profileDirFor(root: string, fallback: string, url: string): string {
  const mine = routeFor(url);
  if (mine) return mine;
  return /(^|\.)indeed\./i.test(hostOf(url)) ? join(root, "data", "browser-profile-indeed") : fallback;
}

/* ADR-024 tier C: LinkedIn is filled, never submitted. Its terms forbid
   automated applying and the account risk is the user's, not ours. */
function modeFor(url: string, mode: ApplyMode): ApplyMode {
  return /(^|\.)linkedin\.com$/i.test(hostOf(url)) ? "fill" : mode;
}

export function queueState(): QueueState {
  return state;
}

/**
 * A run before 2026-11-28 marked a job Naukri already listed as applied as
 * "skipped". It was an application with Naukri's record behind it: show it as
 * applied and put it in the log once, so Results counts it.
 */
let lastConfirmCheck = 0;
export async function reconcileEarlier(root: string): Promise<number> {
  /* "Naukri accepted it but it is not listed yet": Naukri's list lags. Look
     again, at most once a minute, and count it only once it is listed. */
  const waiting = (state.items || []).filter((i) => i.status === "needs" && i.needs === "confirm" && /naukri/i.test(String(i.applyUrl || i.sourceUrl || i.source || "")));
  if (waiting.length && Date.now() - lastConfirmCheck > 60_000) {
    lastConfirmCheck = Date.now();
    await naukriLoadSession(join(root, "data")).catch(() => null);
    const hist = await naukriHistory(30, 100).catch(() => []);
    const have0 = await submittedIds(root);
    for (const it of waiting) {
      const nId = naukriJobId(it, String(it.applyUrl || it.sourceUrl || ""));
      if (nId && hist.some((h) => String(h.jobId) === String(nId))) {
        it.status = "submitted";
        it.needs = undefined;
        it.confirmation = "Listed in your Naukri applied jobs";
        if (!have0.has(String(it.id))) await audit(root, it, "submit");
      }
    }
  }
  const old = (state.items || []).filter((i) => i.status === "skipped" && /already applied/i.test(String(i.message || "")));
  if (!old.length) return 0;
  const have = await submittedIds(root);
  for (const it of old) {
    it.status = "submitted";
    it.earlier = true;
    it.confirmation = /naukri/i.test(String(it.message)) ? "Naukri shows it as applied" : "Applied before";
    if (!have.has(String(it.id))) { await audit(root, it, "submit"); have.add(String(it.id)); }
  }
  return old.length;
}

/** Clears the active challenge on queue state synchronously once answered so HTTP callers never see a stale prompt. */
export function clearResolvedAsk(askId: string): void {
  if (state.ask?.id === askId) {
    state.ask = openAsks().find((a) => a.id !== askId) ?? null;
    emit();
  }
}

/* ---------- cap ---------- */

const capPath = (root: string) => join(root, "data", "apply-cap.json");
const today = () => new Date().toISOString().slice(0, 10);

async function capUsed(root: string): Promise<number> {
  try {
    const j = JSON.parse(await readFile(capPath(root), "utf8"));
    return j && j.date === today() ? Number(j.count) || 0 : 0;
  } catch {
    return 0;
  }
}

async function bumpCap(root: string): Promise<number> {
  const used = (await capUsed(root)) + 1;
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(capPath(root), JSON.stringify({ date: today(), count: used }), "utf8");
  return used;
}

/* ---------- audit ---------- */

async function audit(root: string, item: QueueItem, mode: ApplyMode): Promise<void> {
  await mkdir(join(root, "data"), { recursive: true });
  const row = {
    at: now(),
    id: item.id,
    title: item.title,
    company: item.company,
    source: item.source,
    url: item.applyUrl || item.sourceUrl || "",
    mode,
    resumeMode: item.resumeMode || "tailored",
    confirmation: item.confirmation || "",
    screenshot: item.screenshot || "",
    /* sent before this run: counted as applied, but not as today's or this week's */
    ...(item.earlier ? { earlier: true } : {}),
  };
  await appendFile(join(root, "data", "applications.jsonl"), JSON.stringify(row) + "\n", "utf8");
}

/* The audit log is the server's own record of what was submitted, so a second
   run cannot duplicate an application even if the UI's Track list is stale. */
async function submittedIds(root: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const text = await readFile(join(root, "data", "applications.jsonl"), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j && j.id) out.add(String(j.id));
      } catch {
        /* a half-written line is not a submission */
      }
    }
  } catch {
    /* no log yet */
  }
  return out;
}

/* ---------- page helpers ---------- */

function buttonClickScript(rxSource: string): string {
  return `(() => {
    const rx = new RegExp(${JSON.stringify(rxSource)}, "i");
    const qsa = (root, sel) => {
      const res = [];
      const walk = (node) => {
        if (!node || !node.querySelectorAll) return;
        res.push(...node.querySelectorAll(sel));
        for (const host of node.querySelectorAll("*")) {
          if (host.shadowRoot) walk(host.shadowRoot);
        }
      };
      walk(root);
      return res;
    };
    const nodes = qsa(document, 'button, input[type="submit"], input[type="button"], [role="button"], spl-button, oc-button');
    for (const el of nodes) {
      const inner = el.shadowRoot ? el.shadowRoot.querySelector('button, [role="button"], input[type="submit"]') : null;
      const target = inner || el;
      const disabled =
        el.disabled ||
        target.disabled ||
        el.hasAttribute("disabled") ||
        target.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "true" ||
        target.getAttribute("aria-disabled") === "true";
      if (disabled) continue;
      const t = (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || el.getAttribute("label") || "")
        .replace(/\\s+/g, " ")
        .trim();
      if (!t || t.length > 48 || !rx.test(t)) continue;
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      target.scrollIntoView({ block: "center", inline: "nearest" });
      const r2 = target.getBoundingClientRect();
      let light = target;
      while (light && light.getRootNode && light.getRootNode().host) {
        light = light.getRootNode().host;
      }
      const top = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
      if (top && top !== document.body && top !== document.documentElement && !light.contains(top) && !top.contains(light)) {
        continue;
      }
      target.click();
      return t;
    }
    return "";
  })()`;
}

const SUBMIT_JS = buttonClickScript(
  "^(submit( application| my application)?|send( application| my application)?|finish|complete( application)?)$"
);
const NEXT_JS = buttonClickScript(
  "^(next|continue|save\\s*(&|and)\\s*continue|proceed|review( application)?|next step)$"
);

const CONFIRM_RX =
  /application (has been |was )?(submitted|received|sent)|thank you for (applying|your application)|we('| have| ve) received your application|you have successfully applied|successfully applied|your application is (in|under) review|application complete/i;

async function clickButton(page: Page, script: string): Promise<string> {
  for (const frame of page.frames()) {
    try {
      const t = (await frame.evaluate(script)) as string;
      if (t) return t;
    } catch {
      /* cross-origin frame we cannot touch */
    }
  }
  return "";
}

const clickSubmit = (page: Page) => clickButton(page, SUBMIT_JS);
const clickNext = (page: Page) => clickButton(page, NEXT_JS);

const isNaukriUrl = (url: string) => /(^|\.)naukri\.com$/i.test(hostOf(url));

function naukriJobId(item: QueueItem, pageUrl: string): string {
  if (item.id && /^naukri:/i.test(item.id)) return item.id.replace(/^naukri:/i, "");
  const m = String(pageUrl || item.applyUrl || item.sourceUrl || "").match(/-(\d{6,})(?:[?#]|$)/);
  return m?.[1] ?? "";
}

async function naukriStatusCheck(page: Page): Promise<"already-applied" | "needs-login" | "chatbot" | "none"> {
  try {
    return (await page.evaluate(`(() => {
      const url = location.href || "";
      if (/\\/nlogin\\b/i.test(url)) return "needs-login";
      const btns = Array.from(document.querySelectorAll('button, a, [role="button"], .apply-status, [class*="apply"]'));
      for (const el of btns) {
        const t = (el.innerText || "").replace(/\\s+/g, " ").trim();
        if (!t || t.length > 48) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (/^(already applied|applied)$/i.test(t) || /already applied/i.test(t)) return "already-applied";
        if (/^(login|log in|sign in)\\s+to\\s+apply$|^register\\s+to\\s+apply$/i.test(t)) return "needs-login";
      }
      const loginModal = document.querySelector('#login_Layer, .login-layer, [class*="loginDrawer"]');
      if (loginModal && loginModal.getBoundingClientRect().height > 0) return "needs-login";
      const bot = document.querySelector('[class*="chatbot"], [id*="chatbot"], .apply-drawer, [class*="questionnaire"]');
      if (bot && bot.getBoundingClientRect().height > 0) return "chatbot";
      return "none";
    })()`)) as "already-applied" | "needs-login" | "chatbot" | "none";
  } catch {
    return "none";
  }
}

async function confirmation(page: Page): Promise<string> {
  try {
    const body = (await page.locator("body").innerText({ timeout: 5000 })).replace(/\s+/g, " ").trim();
    const m = body.match(CONFIRM_RX);
    if (m) return m[0];
  } catch {
    /* page may be navigating */
  }
  const url = page.url();
  if (/\/(thanks|thank-you|confirmation|applied|success)/i.test(url)) return "confirmation page";
  return "";
}

async function uploadResume(page: Page, pdfPath: string): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const input = frame.locator('input[type="file"]').first();
      if ((await input.count()) > 0) {
        await input.setInputFiles(pdfPath, { timeout: 8000 });
        return true;
      }
    } catch {
      /* try the next frame */
    }
  }
  return false;
}

async function shot(page: Page, root: string, id: string): Promise<string> {
  const dir = join(root, "data", "apply-shots");
  await mkdir(dir, { recursive: true });
  const p = join(dir, `${safe(id)}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return p;
}

/* ---------- one application ---------- */

type OneResult = {
  ok: boolean;
  submitted: boolean;
  filled: number;
  skipped: string[];
  /** Not a human gate: the job cannot run at all (no tailored PDF). The batch
      moves on instead of pausing for an answer nobody can give in the panel. */
  skip?: boolean;
  needsHuman?: "otp" | "password" | "captcha" | "login" | "fields" | "not-a-form" | "no-browser" | "tailor" | "stale" | "submit" | "confirm";
  fields?: string[];
  confirmation?: string;
  screenshot?: string;
  message?: string;
  /** The site's own record says this job was applied to before (Naukri's
      applied list). An application with proof, not a skip. */
  appliedEarlier?: boolean;
};

/**
 * Press Apply and follow wherever it goes.
 *
 * Indeed's "Apply on company site" opens the employer's form, often in a new
 * tab and on a different host. The old code clicked and then looked at the
 * page it already had, so it saw the same job description and reported
 * "not-a-form". This waits for the popup (or the navigation) and returns the
 * page that actually holds the form.
 */
async function isVisibleChallengeFrame(fr: { frameElement(): Promise<any> }): Promise<boolean> {
  const el = await fr.frameElement().catch(() => null);
  const box = el ? await el.boundingBox().catch(() => null) : null;
  if (!box) return false;
  return box.width >= 50 && box.height >= 50 && box.x >= 0 && box.y >= 0 && box.y < 3000;
}

async function hasBotCheck(page: Page): Promise<boolean> {
  for (const fr of page.frames()) {
    const url = fr.url();
    if (/geo\.captcha-delivery\.com|\/captcha\b/i.test(url) && !/hcaptcha\.com\/captcha/i.test(url)) {
      return true;
    }
    if (/challenges\.cloudflare\.com/i.test(url)) {
      if (await isVisibleChallengeFrame(fr)) return true;
      continue;
    }
    if (/hcaptcha\.com\/captcha/i.test(url)) {
      /* hCaptcha mounts an inert 1280x800 #frame=enclave and an off-screen y:-9999 #frame=challenge even when unchallenged.
         Only treat hCaptcha as active when a non-enclave challenge or checkbox frame is actually visible in viewport. */
      if (/frame=enclave|checkbox-invisible/i.test(url)) continue;
      if (await isVisibleChallengeFrame(fr)) return true;
      continue;
    }
    if (/recaptcha\/(?:api2|enterprise)\/bframe/i.test(url)) {
      if (await isVisibleChallengeFrame(fr)) return true;
      continue;
    }
    const raw = (await fr.locator("body").innerText().catch(() => "")).toLowerCase();
    if (!raw) continue;
    const cleaned = raw.replace(/protected by recaptcha[\s\S]{0,80}/g, " ");
    if (
      /\b(i['’]?m not a robot|i am not a robot|are you a robot|verify you are human|you have been blocked|just a moment|checking your browser|press and hold|solve (?:the|this) (?:captcha|puzzle))\b/i.test(cleaned) ||
      /\bcaptcha\b/i.test(cleaned)
    ) {
      return true;
    }
  }
  return false;
}

async function followApply(page: Page): Promise<{ page: Page; clicked: boolean }> {
  const ctx = page.context();
  const before = new Set(ctx.pages());
  const startUrl = page.url();
  const clicked = await openForm(page);
  if (!clicked) return { page, clicked: false };

  /* A popup is the common case on Indeed; otherwise wait for a real URL change (not 0ms on non-Indeed URLs). */
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const fresh = ctx.pages().find((p) => !before.has(p));
    if (fresh) {
      await fresh.waitForLoadState("domcontentloaded").catch(() => {});
      await fresh.waitForTimeout(2000);
      return { page: fresh, clicked: true };
    }
    if (page.url() !== "about:blank") {
      const changed = await page
        .waitForURL((u) => {
          const s = u.toString();
          return s !== startUrl && !/indeed\.com\/(viewjob|jobs|rc\/clk)/i.test(s);
        }, { timeout: 1200 })
        .then(() => true)
        .catch(() => false);
      if (changed) {
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.locator("input, textarea, select, spl-input, oc-input").first().waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(1500);
        return { page, clicked: true };
      }
    }
    await page.waitForTimeout(400);
  }
  return { page, clicked: true };
}

async function applyOne(item: QueueItem, c: Ctx, mode: ApplyMode): Promise<OneResult> {
  const url = item.applyUrl || item.sourceUrl || "";
  if (!url) return { ok: false, submitted: false, filled: 0, skipped: [], skip: true, message: "This posting has no apply URL." };

  const rec = await loadTailored(c.root, item.id);
  if (!rec) {
    return { ok: false, submitted: false, filled: 0, skipped: [], skip: true, message: "No tailored resume for this job. Tailor it, then run again." };
  }
  item.resumeMode = rec.mode === "original" ? "original" : "tailored";
  if (!(await tailoredPdfIsCurrent(rec))) {
    return { ok: false, submitted: false, filled: 0, skipped: [], skip: true, message: "The tailored PDF changed. Tailor again before applying." };
  }

  const opened = await openVisible(profileDirFor(c.root, c.profileDir, url), url);
  if (!opened.ok) {
    return { ok: false, submitted: false, filled: 0, skipped: [], needsHuman: "no-browser", message: opened.message || "The browser could not open." };
  }
  const page = currentPage();
  if (!page) return { ok: false, submitted: false, filled: 0, skipped: [], needsHuman: "no-browser", message: "The browser is not open." };

  try {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2500);
    return await fillAndMaybeSubmit(page, item, c, modeFor(url, mode), rec);
  } catch (e) {
    return { ok: false, submitted: false, filled: 0, skipped: [], message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ask the user something and wait. The pending ask is published on the queue
 * state so the console (or an MCP client) can render it, and cleared when the
 * answer arrives or the ask expires.
 */
/** Turn a form label into a question a person can answer.
 *
 *  Lever labels are sometimes a full question ("Where are you based out of?")
 *  and sometimes a bare noun ("Full name ✱"). Wrapping the second kind in
 *  "What is your ...?" reads well; wrapping the first does not. */
function askQuestion(label: string): string {
  const clean = String(label || "")
    .replace(/[\s:*?✱∗]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "This field has no label. What should go in it?";
  if (/^(what|why|how|when|where|which|who|do|does|are|is|have|please|describe|tell)\b/i.test(clean)) {
    const s = clean.charAt(0).toUpperCase() + clean.slice(1);
    return /[?.!]$/.test(s) ? s : `${s}?`;
  }
  return `What is your ${clean.toLowerCase()}?`;
}

async function askUser(
  item: QueueItem,
  opts: {
    kind: AskKind;
    label: string;
    detail?: string;
    inputType: AskInput;
    site?: string;
    selector?: string;
    options?: string[];
  }
): Promise<string> {
  if (state.stop) return "";
  if (state.deferBlocked && opts.kind !== "otp" && state.items.some((x) => x.status === "queued")) {
    return "";
  }
  const pending = ask({
    jobId: item.id,
    jobTitle: item.title,
    kind: opts.kind,
    label: opts.label,
    ...(opts.detail ? { detail: opts.detail } : {}),
    inputType: opts.inputType,
    ...(opts.site ? { site: opts.site } : {}),
    ...(opts.selector ? { selector: opts.selector } : {}),
    ...(opts.options ? { options: opts.options } : {}),
  });
  state.ask = openAsks().find((a) => a.jobId === item.id) ?? null;
  emit();
  const value = await pending;
  state.ask = null;
  emit();
  return state.stop ? "" : value;
}

type SiteRec = Awaited<ReturnType<typeof getSite>>;

async function resolveSkippedFields(
  page: Page,
  item: QueueItem,
  c: Ctx,
  host: string,
  site: SiteRec,
  skipped: string[]
): Promise<{ remaining: string[]; aborted: boolean }> {
  const remaining: string[] = [];
  for (const label of skipped) {
    if (state.stop) {
      return { remaining, aborted: true };
    }
    /* A code field is answered by the OTP ask, not this one, and a field
       that already holds a value needs nothing. */
    if (/one-?time|otp|verification code|security code/i.test(label)) continue;
    if (await fieldFilled(page, label)) continue;

    const key = keyFor(label);
    const saved = await lookupAnswer(dataDir(c), host, key);
    if (saved && (await fillByLabel(page, label, saved.value))) continue;

    /* A radio group is a choice, not a sentence: offer its options. */
    const options = await optionsForLabel(page, label);
    const value = await askUser(item, {
      kind: "field",
      label: askQuestion(label),
      detail: `${host} requires this. It is saved to your answers and reused.`,
      inputType: options
        ? "select"
        : /e-?mail/i.test(label)
          ? "email"
          : /phone|mobile/i.test(label)
            ? "tel"
            : /why|cover|motivat|reason|summary|describe/i.test(label)
              ? "textarea"
              : "text",
      site: host,
      selector: label,
      ...(options ? { options } : {}),
    });
    if (state.stop) {
      return { remaining: [...remaining, label], aborted: true };
    }
    if (!value) {
      remaining.push(label);
      continue;
    }
    if (await fillByLabel(page, label, value)) {
      await recordAnswer(dataDir(c), host, key, value).catch(() => {});
    } else {
      remaining.push(label);
    }
  }
  return { remaining, aborted: false };
}

/**
 * The half that runs on whatever page is open: detect the form, fill it, ask
 * for what only the user can answer, attach the PDF, and submit when the mode
 * allows.
 *
 * The ask loop is the point. An OTP, an unknown required field or a bot check
 * is a question in the console, not a reason to hand the user a browser tab.
 */
async function fillAndMaybeSubmit(
  pageIn: Page,
  item: QueueItem,
  c: Ctx,
  mode: ApplyMode,
  rec: { pdf: string }
): Promise<OneResult> {
  let page = pageIn;
  let host = hostOf(page.url());
  let site = await getSite(dataDir(c), host);
  let filled = 0;
  let skipped: string[] = [];
  let sawOtp = false;
  let sawPassword = false;
  let uploadedResume = false;

  for (let round = 0; round < 5; round++) {
    if (state.stop) {
      return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
    }

    /* 1. A bot check is a hand-off, never a solve — check all frames (e.g. DataDome/Cloudflare iframes). */
    if (await hasBotCheck(page)) {
      const done = await askUser(item, {
        kind: "captcha",
        label: "Clear the bot check, then press Done",
        detail: `${host} is showing a bot check. Open the browser, clear it yourself, then come back.`,
        inputType: "none",
        site: host,
      });
      if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
      if (!done) {
        return {
          ok: false, submitted: false, filled, skipped,
          needsHuman: "captcha",
          message: "A bot check is on screen. Clear it in the browser, then continue.",
        };
      }
      await page.waitForTimeout(1500);
      continue;
    }

    /* 2. Pre-check Naukri already-applied status, then press Apply if this is a description page. */
    const naukriPre = isNaukriUrl(page.url()) ? await naukriStatusCheck(page) : "none";
    if (naukriPre === "already-applied") {
      return {
        ok: true, submitted: false, filled, skipped, appliedEarlier: true,
        screenshot: await shot(page, c.root, item.id),
        confirmation: "Naukri shows it as applied",
        message: "Already applied on Naukri before.",
      };
    }
    let fields = await detectAll(page);
    let clickedApply = false;
    if (!looksLikeApplication(fields)) {
      const nav = await followApply(page);
      clickedApply = nav.clicked;
      if (nav.page !== page) {
        page = nav.page;
        host = hostOf(page.url());
        site = await getSite(dataDir(c), host);
      }
      await pause(actionDelay());
      await page.waitForTimeout(2000);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.locator("input, textarea, select, spl-input, oc-input").first().waitFor({ state: "attached", timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1000);
      if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
      fields = await detectAll(page);
    }

    /* 3. One-click confirm, Naukri login/chatbot, OTP, bot check or password page after clicking Apply. */
    if (!looksLikeApplication(fields)) {
      if (clickedApply && mode === "submit") {
        const directConfirm = await confirmation(page);
        if (directConfirm) {
          return {
            ok: true,
            submitted: true,
            filled,
            skipped,
            confirmation: directConfirm,
            screenshot: await shot(page, c.root, item.id),
          };
        }
      }
      if (await hasBotCheck(page)) {
        const done = await askUser(item, {
          kind: "captcha",
          label: "Clear the bot check, then press Done",
          detail: `${host} is showing a bot check. Open the browser, clear it yourself, then come back.`,
          inputType: "none",
          site: host,
        });
        if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
        if (!done) {
          return {
            ok: false, submitted: false, filled, skipped,
            needsHuman: "captcha",
            screenshot: await shot(page, c.root, item.id),
            message: "A bot check is on screen. Clear it in the browser, then Retry.",
          };
        }
        await page.waitForTimeout(1500);
        continue;
      }
      if (isNaukriUrl(page.url())) {
        const nState = await naukriStatusCheck(page);
        if (nState === "already-applied") {
          if (clickedApply && mode === "submit") {
            return {
              ok: true,
              submitted: true,
              filled,
              skipped,
              confirmation: "Applied on Naukri (status confirmed Applied)",
              screenshot: await shot(page, c.root, item.id),
            };
          }
          return {
            ok: true, submitted: false, filled, skipped, appliedEarlier: true,
            screenshot: await shot(page, c.root, item.id),
            confirmation: "Naukri shows it as applied",
            message: "Already applied on Naukri before.",
          };
        }
        if (nState === "needs-login") {
          const done = await askUser(item, {
            kind: "login",
            label: "Sign in to Naukri, then press Done",
            detail: "Open the Career-Ops browser panel and sign in on naukri.com once (personal Chrome sessions aren't shared), then press Done.",
            inputType: "none",
            site: host,
          });
          if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
          if (!done) {
            return {
              ok: false, submitted: false, filled, skipped,
              needsHuman: "login",
              screenshot: await shot(page, c.root, item.id),
              message: "Not signed in to Naukri inside the Career-Ops browser. Open Career-Ops browser and sign in once.",
            };
          }
          await naukriImportFromBrowser(dataDir(c), profileDirFor(c.root, c.profileDir, page.url())).catch(() => null);
          const target = item.applyUrl || item.sourceUrl;
          if (target) await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await page.waitForTimeout(2000);
          continue;
        }
        if (nState === "chatbot") {
          const done = await askUser(item, {
            kind: "login",
            label: "Answer Naukri questions in browser, then press Done",
            detail: "Naukri opened a screening chatbot drawer. Complete it in the Career-Ops browser, then press Done.",
            inputType: "none",
            site: host,
          });
          if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
          await page.waitForTimeout(1500);
          const chatConfirm = await confirmation(page);
          if (chatConfirm) {
            return {
              ok: true, submitted: true, filled, skipped,
              confirmation: chatConfirm,
              screenshot: await shot(page, c.root, item.id),
            };
          }
          return {
            ok: false, submitted: false, filled, skipped,
            needsHuman: done ? "confirm" : "not-a-form",
            screenshot: await shot(page, c.root, item.id),
            message: done
              ? "Finished Naukri drawer, but no confirmation banner appeared. Check Career-Ops browser."
              : "Naukri opened a questionnaire drawer that needs your input in the browser.",
          };
        }
        const nId = naukriJobId(item, page.url());
        const pDir = profileDirFor(c.root, c.profileDir, page.url());
        const cookies = await readBrowserCookies(pDir, "naukri.com").catch(() => []);
        const hasSessionCookie = cookies.some((ck) => ck.name === "nauk_at");
        /* An OTP sign-in on the Naukri page leaves a token on disk and no
           browser cookie. That session is just as valid for applying. */
        const apiSignedIn = naukriApiStatus().signedIn;
        if (mode === "submit" && nId && (hasSessionCookie || apiSignedIn)) {
          const synced = hasSessionCookie
            ? await naukriImportFromBrowser(dataDir(c), pDir).catch(() => ({ ok: false }))
            : { ok: true };
          if (synced.ok) {
            /* Never apply twice: Naukri's own history is the record. */
            const before = await naukriHistory(90, 50).catch(() => []);
            if (before.some((h) => String(h.jobId) === String(nId))) {
              return {
                ok: true, submitted: false, filled, skipped, appliedEarlier: true,
                confirmation: "Listed in your Naukri applied jobs",
                message: "Already applied on Naukri before.",
              };
            }
            const nRes = await naukriApplyJob(nId).catch((e) => ({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }));
            if (nRes.ok) {
              await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
              await page.waitForTimeout(1500);
              /* A 200 is not proof. Naukri's own "applied jobs" list is. */
              let listed = false;
              for (let i = 0; i < 6 && !listed; i++) {
                if (i) await page.waitForTimeout(3000);
                const hist = await naukriHistory(2, 50).catch(() => []);
                listed = hist.some((h) => String(h.jobId) === String(nId));
              }
              if (listed) {
                return {
                  ok: true, submitted: true, filled, skipped,
                  confirmation: "Listed in your Naukri applied jobs",
                  screenshot: await shot(page, c.root, item.id),
                };
              }
              return {
                ok: false, submitted: false, filled, skipped,
                needsHuman: "confirm",
                screenshot: await shot(page, c.root, item.id),
                message: "Naukri accepted the request, but the job is not in your applied list yet. Check naukri.com before counting it.",
              };
            }
            if (/question/i.test(nRes.message)) {
              return {
                ok: false, submitted: false, filled, skipped,
                needsHuman: "not-a-form",
                screenshot: await shot(page, c.root, item.id),
                message: nRes.message,
              };
            }
            if (!hasSessionCookie) {
              return {
                ok: false, submitted: false, filled, skipped,
                screenshot: await shot(page, c.root, item.id),
                message: nRes.message || "Naukri did not accept the application.",
              };
            }
          }
        }
        if (!hasSessionCookie && !apiSignedIn) {
          return {
            ok: false, submitted: false, filled, skipped,
            needsHuman: "login",
            screenshot: await shot(page, c.root, item.id),
            message: "No active Naukri login found in Career-Ops browser. Open Career-Ops browser and sign in on naukri.com once.",
          };
        }
      }
      const st = await pageState();
      if (await needsOtp(page)) {
        sawOtp = true;
        const code = await askUser(item, {
          kind: "otp",
          label: "Enter the one-time code",
          detail: `${host} sent a code. Paste it here and the run continues.`,
          inputType: "otp",
          site: host,
        });
        if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
        if (!code) {
          return { ok: false, submitted: false, filled, skipped, needsHuman: "otp", message: "The site is waiting for a one-time code." };
        }
        if (!(await fillOtp(page, code))) {
          return { ok: false, submitted: false, filled, skipped, needsHuman: "otp", message: "Could not find the code field." };
        }
        await page.waitForTimeout(3000);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        continue;
      }
      if (st?.needs === "password") {
        sawPassword = true;
        const done = await askUser(item, {
          kind: "login",
          label: "Sign in, then press Done",
          detail: `${host} wants a password. Sign in yourself; we never see or store it.`,
          inputType: "none",
          site: host,
        });
        if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
        if (!done) {
          return { ok: false, submitted: false, filled, skipped, needsHuman: "login", message: "The site wants a sign-in." };
        }
        await page.waitForTimeout(2500);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        continue;
      }
      const bodySnippet = (await page.locator("body").innerText().catch(() => "")).slice(0, 1200);
      const expired = /\b(expired|no longer accepting|position has been filled|job is closed)\b/i.test(bodySnippet);
      return {
        ok: false, submitted: false, filled, skipped,
        needsHuman: "not-a-form",
        screenshot: await shot(page, c.root, item.id),
        message: expired
          ? "The posting appears to be closed or expired."
          : `No application form found on ${host}. Open the posting to check if a sign-in or click-through is needed.`,
      };
    }

    /* 4. Attach the resume PDF BEFORE filling fields so ATS parsers
       (SmartRecruiters, Lever, Ashby) finish autofilling first, and we do not
       overwrite or prompt for fields the resume already populated. */
    if (!uploadedResume) {
      uploadedResume = await uploadResume(page, rec.pdf).catch(() => false);
      if (uploadedResume) {
        await page.waitForTimeout(2500);
        if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
        fields = await detectAll(page);
      }
    }
    const res = await fillFields(fields, c.profile);
    filled = res.filled;
    skipped = res.skipped;

    /* 5. A code may appear only after the email is submitted. */
    const st = await pageState();
    if (await needsOtp(page)) {
      sawOtp = true;
      const code = await askUser(item, {
        kind: "otp",
        label: "Enter the one-time code",
        detail: `${host} sent a code. Paste it here and the run continues.`,
        inputType: "otp",
        site: host,
      });
      if (!code) {
        return { ok: false, submitted: false, filled, skipped, needsHuman: "otp", message: "The site is waiting for a one-time code." };
      }
      if (!(await fillOtp(page, code))) {
        return { ok: false, submitted: false, filled, skipped, needsHuman: "otp", message: "Could not find the code field." };
      }
      await page.waitForTimeout(3000);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      continue;
    }
    if (st?.needs === "password") {
      sawPassword = true;
      const done = await askUser(item, {
        kind: "login",
        label: "Sign in, then press Done",
        detail: `${host} wants a password. Sign in yourself; we never see or store it.`,
        inputType: "none",
        site: host,
      });
      if (!done) {
        return { ok: false, submitted: false, filled, skipped, needsHuman: "login", message: "The site wants a sign-in." };
      }
      await page.waitForTimeout(2500);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      continue;
    }

    /* 6. Ask for each required field the profile cannot answer. A saved
       answer is offered first; a new one is remembered for the next form. */
    if (skipped.length) {
      const resolved = await resolveSkippedFields(page, item, c, host, site, skipped);
      skipped = resolved.remaining;
      if (resolved.aborted) {
        return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
      }
      if (skipped.length) {
        return {
          ok: false, submitted: false, filled, skipped,
          needsHuman: "fields",
          fields: skipped,
          screenshot: await shot(page, c.root, item.id),
          message: `Needs answer for: ${skipped.join(", ")}.`,
        };
      }
    }

    /* 7. Remember the flow so the next posting on this site is cheaper. */
    await touchSite(dataDir(c), host, {
      flow: flowFrom(host, sawOtp, sawPassword),
      fields: fields.map((f) => ({
        key: keyFor(f.label),
        label: f.label,
        selector: f.selector,
        type: f.type,
      })),
    }).catch(() => {});

    break;
  }

  const screenshot = await shot(page, c.root, item.id);
  if (mode === "fill") {
    const onLinkedIn = /(^|\.)linkedin\.com$/i.test(hostOf(page.url()));
    return {
      ok: true,
      submitted: false,
      filled,
      skipped,
      screenshot,
      message: onLinkedIn
        ? "Filled. LinkedIn is never submitted for you; press Submit there."
        : "Form filled. Open the browser to review it, or turn on Submit automatically.",
    };
  }

  if (process.env.CAREER_OPS_AUTOAPPLY === "0") {
    return { ok: true, submitted: false, filled, skipped, screenshot, message: "Submit is off (CAREER_OPS_AUTOAPPLY=0). The form is filled." };
  }

  /* Advance through multi-step wizards (e.g. SmartRecruiters Next -> Preliminary Questions, EPAM Step 1..7 NEXT) up to 9 transitions before final Submit. */
  for (let wizard = 0; wizard < 10; wizard++) {
    if (state.stop) {
      return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
    }
    const pressed = await clickSubmit(page);
    if (pressed) {
      await page.waitForTimeout(4500);
      if (await hasBotCheck(page)) {
        const doneCap = await askUser(item, {
          kind: "captcha",
          label: "Clear the bot check, then press Done",
          detail: `${host} showed a verification challenge after submit. Clear it in Career-Ops browser, then press Done.`,
          inputType: "none",
          site: host,
        });
        if (state.stop) return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
        if (doneCap) {
          await page.waitForTimeout(2000);
        } else {
          return {
            ok: false,
            submitted: false,
            filled,
            skipped,
            needsHuman: "captcha",
            screenshot: await shot(page, c.root, item.id),
            message: "Verification challenge appeared after Submit. Clear it in Career-Ops browser.",
          };
        }
      }
      const done = await confirmation(page);
      const afterShot = await shot(page, c.root, item.id);
      if (done) {
        return { ok: true, submitted: true, filled, skipped, confirmation: done, screenshot: afterShot };
      }
      return {
        ok: false,
        submitted: false,
        filled,
        skipped,
        needsHuman: "confirm",
        screenshot: afterShot,
        message: "Submit was pressed but no confirmation appeared. Open the browser to check.",
      };
    }

    const nextPressed = await clickNext(page);
    if (!nextPressed) {
      return {
        ok: false,
        submitted: false,
        filled,
        skipped,
        needsHuman: "submit",
        screenshot: await shot(page, c.root, item.id),
        message: "Could not find the submit button. Open the browser and press it.",
      };
    }

    await page.waitForTimeout(2500);
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    for (let w = 0; w < 18; w++) {
      if (state.stop) {
        return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
      }
      const parsing = await page
        .evaluate(`(() => /analysing your cv|analyzing your cv|parsing in progress|processing your (resume|cv)/i.test((document.body && document.body.innerText) || ""))()`)
        .catch(() => false);
      if (parsing) {
        if (w >= 8) {
          const skipBtn = page.locator('button:has-text("SKIP"), button:has-text("Skip")').first();
          if (await skipBtn.isVisible().catch(() => false)) {
            await skipBtn.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(2000);
            break;
          }
        }
        await page.waitForTimeout(1000);
        continue;
      }
      const probe = await detectAll(page);
      if (probe.length > 0) break;
      const hasAct = await page
        .evaluate(`(() => !!Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], spl-button, oc-button')).find((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !b.disabled && /^(submit|next|continue|send|finish|complete)/i.test((b.innerText||b.textContent||b.value||"").trim());
        }))()`)
        .catch(() => false);
      if (hasAct) break;
      await page.waitForTimeout(800);
    }
    if (state.stop) {
      return { ok: false, submitted: false, filled, skipped, message: "Stopped by you." };
    }
    const postNextConfirm = await confirmation(page);
    if (postNextConfirm) {
      return {
        ok: true,
        submitted: true,
        filled,
        skipped,
        confirmation: postNextConfirm,
        screenshot: await shot(page, c.root, item.id),
      };
    }

    const stepFields = await detectAll(page);
    if (stepFields.length) {
      const stepRes = await fillFields(stepFields, c.profile);
      filled += stepRes.filled;
      if (stepRes.skipped.length) {
        const resolved = await resolveSkippedFields(page, item, c, host, site, stepRes.skipped);
        if (resolved.aborted) {
          return { ok: false, submitted: false, filled, skipped: resolved.remaining, message: "Stopped by you." };
        }
        if (resolved.remaining.length) {
          skipped = [...skipped, ...resolved.remaining];
          return {
            ok: false,
            submitted: false,
            filled,
            skipped,
            needsHuman: "fields",
            fields: resolved.remaining,
            screenshot: await shot(page, c.root, item.id),
            message: `Needs answer on next step: ${resolved.remaining.join(", ")}.`,
          };
        }
      }
    }
  }

  return {
    ok: false,
    submitted: false,
    filled,
    skipped,
    needsHuman: "submit",
    screenshot: await shot(page, c.root, item.id),
    message: "Reached the multi-step wizard limit without a final Submit button. Open the browser to finish.",
  };
}

/* ---------- queue ---------- */

export async function startQueue(opts: {
  root: string;
  profileDir: string;
  profile: FillProfile;
  jobs: QueueJob[];
  mode: ApplyMode;
  cap?: number;
  deferBlocked?: boolean;
}): Promise<{ ok: boolean; error?: string; state: QueueState }> {
  if (state.running) return { ok: false, error: "A run is already going.", state };
  if (state.paused) return { ok: false, error: "A run is paused. Continue or stop it first.", state };

  const seen = new Set<string>();
  const jobs = opts.jobs.filter((j) => {
    const id = String(j.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!jobs.length) return { ok: false, error: "No jobs to apply to.", state };

  const cap = Math.max(1, Math.min(50, Number(opts.cap) || 10));
  const used = await capUsed(opts.root);
  if (opts.mode === "submit" && used >= cap) {
    return { ok: false, error: `Today's cap is reached (${used}/${cap}). Use fill-only, or try tomorrow.`, state };
  }
  /* Submit mode must not overshoot the cap, and already-submitted items must
     be excluded BEFORE computing room so duplicates never trim unapplied tail items. */
  const already = opts.mode === "submit" ? await submittedIds(opts.root) : new Set<string>();
  const fresh = jobs.filter((j) => !already.has(String(j.id)));
  const dups = jobs.filter((j) => already.has(String(j.id)));
  const room = opts.mode === "submit" ? Math.max(0, cap - used) : cap;

  ctx = { root: opts.root, profileDir: opts.profileDir, profile: opts.profile };
  state = {
    running: true,
    paused: false,
    mode: opts.mode,
    items: [
      ...fresh.slice(0, room).map((j) => ({ ...j, status: "queued" as const })),
      ...dups.map((j) => ({
        ...j,
        status: "skipped" as const,
        message: "Already submitted. Left out to avoid a duplicate.",
        finishedAt: now(),
      })),
    ],
    startedAt: now(),
    stop: false,
    deferBlocked: opts.deferBlocked !== undefined ? Boolean(opts.deferBlocked) : jobs.length > 1,
    cap,
    used,
    ask: null,
  };

  emit();
  void runQueue();
  return { ok: true, state };
}

/**
 * Apply one result to the queue item and the run. Returns what the loop should
 * do next: pause the run, skip straight on, or continue with the normal delay.
 */
async function settle(
  item: QueueItem,
  r: OneResult,
  c: Ctx,
  mode: ApplyMode
): Promise<"paused" | "skip" | "done"> {
  item.filled = r.filled;
  item.skipped = r.skipped;
  item.screenshot = r.screenshot;
  item.message = r.message;

  if (state.stop && !r.submitted) {
    item.status = "skipped";
    item.message = "Stopped by you.";
    item.finishedAt = now();
    emit();
    return "skip";
  }

  if (r.appliedEarlier) {
    item.status = "submitted";
    item.confirmation = r.confirmation || "Applied before";
    item.earlier = true;
    item.message = r.message;
    item.finishedAt = now();
    /* Results counts what the server's log holds; add it once, without
       spending today's cap (it was sent on an earlier day) */
    if (!(await submittedIds(c.root)).has(String(item.id))) await audit(c.root, item, mode);
    emit();
    return "done";
  }

  if (r.skip) {
    item.status = "skipped";
    item.finishedAt = now();
    return "skip";
  }

  if (r.needsHuman) {
    item.status = "needs";
    item.needs = r.needsHuman;
    item.fields = r.fields;
    item.finishedAt = now();
    /* Park this job and keep the batch moving. One job that needs a code must
       not stop the other nine; the console shows it under "needs you". */
    await recordOutcome(dataDir(c), hostOf(item.applyUrl || item.sourceUrl || ""), false).catch(() => {});
    emit();
    return "done";
  }

  if (r.submitted) {
    item.status = "submitted";
    item.confirmation = r.confirmation;
    item.finishedAt = now();
    state.used = await bumpCap(c.root);
    await audit(c.root, item, mode);
    await recordOutcome(dataDir(c), hostOf(item.applyUrl || item.sourceUrl || ""), true).catch(() => {});
  } else if (r.ok) {
    item.status = mode === "submit" ? "failed" : "filled";
    item.finishedAt = now();
  } else {
    item.status = "failed";
    item.finishedAt = now();
  }
  emit();
  return "done";
}

async function runQueue(): Promise<void> {
  if (!ctx) return;
  state.running = true;
  const already = state.mode === "submit" ? await submittedIds(ctx.root) : new Set<string>();
  while (true) {
    if (state.stop) {
      for (const rem of state.items) {
        if (rem.status === "queued") {
          rem.status = "skipped";
          rem.message = "Stopped by you.";
          rem.finishedAt = now();
        }
      }
      break;
    }
    const item = state.items.find((x) => x.status === "queued");
    if (!item) break;

    if (already.has(String(item.id))) {
      item.status = "skipped";
      item.message = "Already submitted. Left out to avoid a duplicate.";
      item.finishedAt = now();
      continue;
    }

    state.current = item.id;
    item.status = "filling";
    item.startedAt = now();
    emit();

    const r = await serialise(hostOf(item.applyUrl || item.sourceUrl || ""), () => applyOne(item, ctx!, state.mode));
    const outcome = await settle(item, r, ctx, modeFor(item.applyUrl || item.sourceUrl || "", state.mode));
    state.current = undefined;
    emit();
    if (outcome === "paused") return;
    if (outcome === "skip") continue;

    /* Space real submissions out cleanly; parked/failed/skipped items need only a brief pause. */
    const more = state.items.some((x) => x.status === "queued");
    if (more && !state.stop) {
      const waitMs =
        r.submitted && state.mode === "submit"
          ? 30_000 + Math.random() * 60_000
          : 1_500 + Math.random() * 1_000;
      for (let left = waitMs; left > 0 && !state.stop; left -= 300) {
        await pause(Math.min(300, left));
      }
    }
  }
  state.running = false;
  state.current = undefined;
  state.finishedAt = now();
  state.ask = null;
  emit();
}

export async function stopQueue(): Promise<QueueState> {
  state.stop = true;
  state.paused = false;
  cancelAll();
  state.ask = null;
  for (const it of state.items) {
    if (it.status === "queued" || (!state.running && it.status === "needs")) {
      it.status = "skipped";
      it.message = "Stopped by you.";
      it.finishedAt = now();
    }
  }
  if (!state.running) {
    state.current = undefined;
    state.finishedAt = now();
  } else {
    for (let i = 0; i < 8 && state.running; i++) await pause(50);
  }
  emit();
  return state;
}


/**
 * Retry the jobs that parked. A parked job is one whose question expired or
 * whose page needed something the run could not get. The console's "Retry
 * parked" button and the MCP `resume_apply_batch` tool both land here.
 *
 * The queue may still be running (other jobs are being applied); in that case
 * the parked jobs are simply put back in line and the loop picks them up.
 */
export async function resumeQueue(): Promise<{ ok: boolean; error?: string; state: QueueState }> {
  if (!ctx) return { ok: false, error: "No run to continue.", state };

  const parked = state.items.filter((x) => x.status === "needs");
  if (!parked.length) return { ok: false, error: "Nothing is waiting.", state };

  for (const item of parked) {
    item.status = "queued";
    item.needs = undefined;
    item.fields = undefined;
    item.message = "Queued again.";
    item.finishedAt = undefined;
  }
  state.stop = false;
  state.deferBlocked = false;
  state.finishedAt = undefined;
  emit();

  if (!state.running) void runQueue();
  return { ok: true, state };
}

/** Put one parked job back in line, by id. */
export async function retryJob(id: string): Promise<{ ok: boolean; error?: string; state: QueueState }> {
  if (!ctx) return { ok: false, error: "No run to continue.", state };
  const item = state.items.find((x) => x.id === String(id || ""));
  if (!item) return { ok: false, error: "That job is not in this batch.", state };
  if (item.status !== "needs" && item.status !== "failed" && item.status !== "skipped") {
    return { ok: false, error: "That job is not parked.", state };
  }
  item.status = "queued";
  item.needs = undefined;
  item.fields = undefined;
  item.message = "Queued again.";
  item.finishedAt = undefined;
  state.stop = false;
  state.deferBlocked = false;
  state.finishedAt = undefined;
  emit();
  if (!state.running) void runQueue();
  return { ok: true, state };
}
