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

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { currentPage, openVisible, pageState } from "./browser";
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
};

export type QueueStatus = "queued" | "filling" | "filled" | "needs" | "submitted" | "failed" | "skipped";

export type QueueItem = QueueJob & {
  status: QueueStatus;
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
    confirmation: item.confirmation || "",
    screenshot: item.screenshot || "",
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

const SUBMIT_JS = `(() => {
  const rx = /^(submit( application| my application)?|send( application| my application)?|apply( now| for this job)?|finish|complete( application)?)$/i;
  const nodes = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
  for (const el of nodes) {
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
    if (!t || t.length > 40) continue;
    if (!rx.test(t)) continue;
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    el.click();
    return t;
  }
  return "";
})()`;

const CONFIRM_RX =
  /application (has been |was )?(submitted|received|sent)|thank you for (applying|your application)|we('| have| ve) received your application|successfully applied|your application is (in|under) review|application complete/i;

async function clickSubmit(page: Page): Promise<string> {
  for (const frame of page.frames()) {
    try {
      const t = (await frame.evaluate(SUBMIT_JS)) as string;
      if (t) return t;
    } catch {
      /* cross-origin frame we cannot touch */
    }
  }
  return "";
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
async function followApply(page: Page): Promise<Page> {
  const ctx = page.context();
  const before = new Set(ctx.pages());
  const clicked = await openForm(page);
  if (!clicked) return page;

  /* A popup is the common case on Indeed. */
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const fresh = ctx.pages().find((p) => !before.has(p));
    if (fresh) {
      await fresh.waitForLoadState("domcontentloaded").catch(() => {});
      await fresh.waitForTimeout(2000);
      return fresh;
    }
    if (page.url() !== "about:blank") {
      const changed = await page
        .waitForURL((u) => !/indeed\.com\/(viewjob|jobs|rc\/clk)/i.test(u.toString()), { timeout: 1200 })
        .then(() => true)
        .catch(() => false);
      if (changed) {
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(1500);
        return page;
      }
    }
    await page.waitForTimeout(400);
  }
  return page;
}

async function applyOne(item: QueueItem, c: Ctx, mode: ApplyMode): Promise<OneResult> {
  const url = item.applyUrl || item.sourceUrl || "";
  if (!url) return { ok: false, submitted: false, filled: 0, skipped: [], skip: true, message: "This posting has no apply URL." };

  const rec = await loadTailored(c.root, item.id);
  if (!rec) {
    return { ok: false, submitted: false, filled: 0, skipped: [], skip: true, message: "No tailored resume for this job. Tailor it, then run again." };
  }
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
  return value;
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

  for (let round = 0; round < 5; round++) {
    /* 1. A bot check is a hand-off, never a solve. */
    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/captcha|are you a robot|verify you are human/.test(body)) {
      const done = await askUser(item, {
        kind: "captcha",
        label: "Clear the bot check, then press Done",
        detail: `${host} is showing a bot check. Open the browser, clear it yourself, then come back.`,
        inputType: "none",
        site: host,
      });
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

    /* 2. Find the form, pressing Apply if this is a description page. Indeed
       hands most applications to the employer, so the click can open a new
       tab on a new host; follow it and re-read the site memory for that host. */
    let fields = await detectAll(page);
    if (!looksLikeApplication(fields)) {
      const next = await followApply(page);
      if (next !== page) {
        page = next;
        host = hostOf(page.url());
        site = await getSite(dataDir(c), host);
      }
      await pause(actionDelay());
      await page.waitForTimeout(2500);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(1500);
      fields = await detectAll(page);
    }

    /* 3. A code or password page is not a form yet. Ask, then look again. */
    if (!looksLikeApplication(fields)) {
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
      return {
        ok: false, submitted: false, filled, skipped,
        needsHuman: "not-a-form",
        message: "No application form was found. The posting may be closed or need a sign-in.",
      };
    }

    /* 4. Fill what the confirmed profile answers. */
    const res = await fillFields(fields, c.profile);
    filled = res.filled;
    skipped = res.skipped;
    await uploadResume(page, rec.pdf).catch(() => {});

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
      const remaining: string[] = [];
      for (const label of skipped) {
        /* A code field is answered by the OTP ask, not this one, and a field
           that already holds a value needs nothing. */
        if (/one-?time|otp|verification code|security code/i.test(label)) continue;
        if (await fieldFilled(page, label)) continue;

        const key = keyFor(label);
        const saved = site?.answers[key];
        if (saved && (await fillByLabel(page, label, saved))) continue;

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
      skipped = remaining;
      if (skipped.length) {
        return {
          ok: false, submitted: false, filled, skipped,
          needsHuman: "fields",
          fields: skipped,
          message: "These required fields still have no answer.",
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

  const pressed = await clickSubmit(page);
  if (!pressed) {
    return { ok: false, submitted: false, filled, skipped, needsHuman: "submit", screenshot, message: "Could not find the submit button. Open the browser and press it." };
  }
  await page.waitForTimeout(4500);
  const done = await confirmation(page);
  if (!done) {
    return { ok: false, submitted: false, filled, skipped, needsHuman: "confirm", screenshot, message: "Submit was pressed but no confirmation appeared. Open the browser to check." };
  }
  return { ok: true, submitted: true, filled, skipped, confirmation: done, screenshot };
}

/* ---------- queue ---------- */

export async function startQueue(opts: {
  root: string;
  profileDir: string;
  profile: FillProfile;
  jobs: QueueJob[];
  mode: ApplyMode;
  cap?: number;
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
  /* Submit mode must not overshoot the cap: if five were sent today, this run
     gets five, not ten. */
  const room = opts.mode === "submit" ? Math.max(0, cap - used) : cap;

  ctx = { root: opts.root, profileDir: opts.profileDir, profile: opts.profile };
  state = {
    running: true,
    paused: false,
    mode: opts.mode,
    items: jobs.slice(0, room).map((j) => ({ ...j, status: "queued" })),
    startedAt: now(),
    stop: false,
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
  for (const item of state.items) {
    if (state.stop) {
      if (item.status === "queued") {
        item.status = "skipped";
        item.message = "Stopped by you.";
      }
      continue;
    }
    if (item.status !== "queued") continue;

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
    if (outcome === "paused") return;
    if (outcome === "skip") continue;

    /* Space applications out. A batch fired in ten seconds is a bot. Skip the
       wait after the last job, or the run looks stuck for a minute. */
    const more = state.items.some((x) => x.status === "queued");
    if (more) {
      if (state.mode === "submit") {
        await pause(30_000 + Math.random() * 60_000);
      } else {
        await pause(2_000 + Math.random() * 3_000);
      }
    }
  }
  state.running = false;
  state.finishedAt = now();
  state.ask = null;
  emit();
}

export async function stopQueue(): Promise<QueueState> {
  state.stop = true;
  cancelAll();
  state.ask = null;
  if (!state.running) {
    /* Nothing is looping, so stop has to clean up here. The parked job and
       everything still queued become skipped; the browser stays open. */
    state.paused = false;
    for (const it of state.items) {
      if (it.status === "queued" || it.status === "needs") {
        it.status = "skipped";
        it.message = "Stopped by you.";
        it.finishedAt = now();
      }
    }
    state.finishedAt = now();
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
  state.finishedAt = undefined;
  emit();
  if (!state.running) void runQueue();
  return { ok: true, state };
}
