// Fill an employer's own application form.
//
// This is the part of "Apply" that is genuinely useful: Lever, Greenhouse,
// Ashby and SmartRecruiters all render a plain HTML form, so the agent can put
// the candidate's confirmed details into it. This file never presses submit;
// auto apply (ADR-024) adds that step and verifies a confirmation. The window
// stays open so the user can read every field and attach the tailored PDF.
//
// Naukri is not here on purpose. Its apply flow runs in the user's own browser
// (ADR-024) and many of its buttons hand off to one of these ATS forms anyway,
// which is the case this file covers.
//
// Two things every one of those boards does, and the first version missed:
//   1. the URL is a job *description*, and the form only appears after the
//      "Apply" button is pressed;
//   2. the form is often inside an iframe (Greenhouse embeds, Ashby embeds).
// Both are handled below, so "no fillable form" now means what it says.

import type { Frame, Page } from "playwright-core";
import { dirname } from "node:path";
import { HAS_CHROME, currentPage, openVisible } from "../lib/browser";
import { actionDelay, hostOf, pause, serialise, typeDelay } from "../lib/pace";
import { getForm, putForm, type CachedField } from "../lib/formcache";

export type FillProfile = {
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  linkedin?: string;
  website?: string;
  currentCompany?: string;
  currentTitle?: string;
  years?: number;
  /** Typed by the user on the apply page. Never generated. */
  expectedCtc?: string;
};

export type FillResult = {
  ok: boolean;
  filled: number;
  skipped: string[];
  needsHuman?: "no-browser" | "captcha" | "login" | "not-a-form";
  message?: string;
  /** True when the field list came from the per-site cache, not a fresh read. */
  fromCache?: boolean;
};

export type RawField = {
  selector: string;
  label: string;
  /** The element's name/id value, without the attribute syntax. Including
   *  `[name="..."]` in the match string made every field look like a name
   *  field, which put the candidate's name into "notice period". */
  hint: string;
  type: string;
  required: boolean;
  options?: string[];
};

export type Field = RawField & { frame: Frame };

/**
 * The best human name for a field.
 *
 * Lever and a few others put "Type your response" in the visible label and the
 * real name in the input's name attribute. Asking "What is your type your
 * response?" is useless; the name attribute ("reason_for_change") is not.
 */
export function labelFor(f: RawField): string {
  const l = String(f.label || "").replace(/\s+/g, " ").trim();
  const generic =
    !l ||
    /^(type your response|enter your (answer|response)|your (answer|response)|answer|response|text|input|select)$/i.test(l);
  if (!generic) return l;
  const h = String(f.hint || "")
    .replace(/[\[\]{}_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return h || l || f.selector;
}

/* The form opens in the same browser the user sees inside Career-Ops, so the
   filled fields are visible in the panel rather than in a stray window. */
function answerFor(f: RawField, p: FillProfile): string | undefined {
  const l = `${f.label} ${f.hint}`.toLowerCase();
  if (f.type === "email" || /\be-?mail\b/.test(l)) return p.email;
  if (f.type === "tel" || /\b(phone|mobile|contact number)\b/.test(l)) return p.phone;
  if (/\b(first name|given name)\b/.test(l)) return p.fullName?.split(/\s+/)[0];
  if (/\b(last name|surname|family name)\b/.test(l)) return p.fullName?.split(/\s+/).slice(1).join(" ");
  if (/\b(full name|your name|^name\b|\bname\b)/.test(l) && !/company|file|user/.test(l)) return p.fullName;
  if (/\blinkedin\b/.test(l)) return p.linkedin;
  if (/\b(github|portfolio|website|personal site|url)\b/.test(l)) return p.website;
  if (/\b(city|location|where are you based)\b/.test(l)) return p.city;
  if (/\b(current|present) (company|employer)\b/.test(l)) return p.currentCompany;
  if (/\b(current|present) (title|role|designation)\b/.test(l)) return p.currentTitle;
  if (/\b(years|total experience)\b/.test(l) && p.years !== undefined) return String(p.years);
  /* Only a number the user typed themselves. Never estimated. "Current CTC"
     is deliberately not answered: we do not know it, and guessing it would be
     a lie on a form. */
  if (/\bexpected\s*(ctc|salary|compensation)\b/.test(l) && p.expectedCtc) return p.expectedCtc;
  /* notice period, "why this role": only the user can answer these */
  return undefined;
}

/* Passed as a string: esbuild's __name helper does not exist in the page. */
const DETECT = `(() => {
  const out = [];
  const seen = new Set();

  /* Radio groups are one question with a few choices. Detect them as a single
     field so the ask can offer the choices instead of asking for free text. */
  const groups = new Map();
  for (const el of document.querySelectorAll('input[type="radio"]')) {
    if (el.disabled || el.offsetParent === null) continue;
    const n = el.getAttribute("name") || "";
    if (!n) continue;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(el);
  }
  for (const [n, els] of groups) {
    const options = els.map((e) => {
      const w = e.closest("label");
      return ((w && w.innerText) || e.getAttribute("aria-label") || e.value || "").replace(/\\s+/g, " ").trim();
    }).filter(Boolean);
    let label = "";
    const holder =
      els[0].closest("[class*='question'], fieldset") ||
      els[0].closest("li, [class*='field']");
    if (holder) {
      label = (holder.innerText || "").replace(/\\s+/g, " ").trim();
      for (const o of options) label = label.split(o).join(" ");
      label = label.replace(/[✱∗]/g, "").replace(/\\s+/g, " ").trim();
      /* A wrapper can hold several questions; the group's own question is the
         first one, so stop at its question mark. */
      const qm = label.indexOf("?");
      if (qm > 0 && qm < 140) label = label.slice(0, qm + 1);
    }
    if (!label) label = n;
    const selector = '[name=' + JSON.stringify(n) + ']';
    if (seen.has(selector)) continue;
    seen.add(selector);
    out.push({
      selector,
      label: label.slice(0, 120),
      hint: String(n).slice(0, 120),
      type: "radio",
      required: els.some((e) => e.hasAttribute("required") || e.getAttribute("aria-required") === "true"),
      options
    });
  }

  const nodes = Array.from(document.querySelectorAll("input, textarea, select"));
  for (const el of nodes) {
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (["hidden", "submit", "button", "reset", "search", "checkbox", "radio", "file"].includes(type)) continue;
    if (el.disabled || el.readOnly) continue;
    if (el.offsetParent === null) continue;

    let label = "";
    if (el.id) {
      const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) label = lab.innerText;
    }
    if (!label) {
      const wrap = el.closest("label");
      if (wrap) label = wrap.innerText;
    }
    if (!label) label = el.getAttribute("aria-label") || "";
    if (!label && el.getAttribute("aria-labelledby")) {
      const ids = el.getAttribute("aria-labelledby").split(/\\s+/);
      label = ids.map((id) => {
        const n = document.getElementById(id);
        return n ? (n.innerText || "") : "";
      }).join(" ").trim();
    }
    if (!label) {
      /* A placeholder like "Type your response" is not a label; it is the
         widget's default text. Ignoring it lets the container climb below
         find the real question ("What is your current CTC?"). */
      const ph = (el.getAttribute("placeholder") || "").replace(/\\s+/g, " ").trim();
      if (ph && !/^(type your response|enter your (answer|response)|your (answer|response)|answer|response|text|input|select)$/i.test(ph)) {
        label = ph;
      }
    }
    if (!label) {
      /* Only trust a container label when the container holds exactly one
         control. Climbing to a big div and taking its first label is how the
         candidate's name ended up in "What is your notice period". */
      let box = el.parentElement;
      for (let up = 0; up < 5 && box; up++, box = box.parentElement) {
        const controls = box.querySelectorAll("input, textarea, select").length;
        if (controls > 1) break;
        const lab = box.querySelector("label, legend, .label, [class*='label'], h1, h2, h3, h4, h5, h6");
        if (lab && (lab.innerText || "").trim()) { label = lab.innerText; break; }
        /* Lever's custom cards put the question in a plain div, not a label.
           With one control in the box, that text is the question. */
        const own = (box.innerText || "").replace(/\\s+/g, " ").trim();
        if (own && own.length <= 140) { label = own; break; }
      }
    }

    const name = el.getAttribute("name") || el.id || "";
    const selector = el.id
      ? "#" + CSS.escape(el.id)
      : (name ? "[name=" + JSON.stringify(name) + "]" : "");
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);

    out.push({
      selector,
      label: (label || name || "").replace(/[✱∗]/g, "").replace(/\\s+/g, " ").trim().slice(0, 120),
      hint: String(name || "").slice(0, 120),
      type,
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      options: el.tagName === "SELECT"
        ? Array.from(el.options).map((o) => o.value).filter(Boolean)
        : undefined
    });
  }
  return out;
})()`;

/* The "Apply" control on a description page. Exact-ish on purpose: a loose
   /apply/ match also hits "Apply with LinkedIn" and the site's own nav. */
const OPEN_FORM = `(() => {
  const rx = /^(apply|apply now|apply for this (job|position|role)|apply to this (job|position|role)|apply on (the )?(company|employer) (site|website)|apply externally|continue to (the )?application|i'?m interested|start (my )?application|submit application|apply here)$/i;
  const nodes = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]'));
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

async function detectInFrame(frame: Frame): Promise<RawField[]> {
  try {
    return (await frame.evaluate(DETECT)) as RawField[];
  } catch {
    /* a cross-origin frame that refuses evaluation is not an error here */
    return [];
  }
}

export async function detectAll(page: Page): Promise<Field[]> {
  const out: Field[] = [];
  for (const frame of page.frames()) {
    const raw = await detectInFrame(frame);
    for (const f of raw) out.push({ ...f, frame });
  }
  return out;
}

/* A job board's own search box is not an application form. Require at least
   one field that only an application would ask for. */
const APPLY_SIGNAL =
  /\b(e-?mail|full name|first name|last name|surname|phone|mobile|resume|cv|cover letter|linkedin|portfolio|current company|notice period)\b/i;

export function looksLikeApplication(fields: Field[]): boolean {
  return fields.some(
    (f) => f.type === "email" || f.type === "tel" || APPLY_SIGNAL.test(`${f.label} ${f.hint}`)
  );
}

export async function openForm(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const t = await frame.evaluate(OPEN_FORM);
      if (t) return true;
    } catch {
      /* ignore frames we cannot touch */
    }
  }
  return false;
}

/** Fill every field we have an answer for. Shared by the cache path and the
 *  fresh-detection path so both behave identically. */
/**
 * Pick the radio whose visible label matches the answer. A radio group is one
 * question, so the answer is one of its options, not a free-text value.
 */
async function checkRadio(f: Field, value: string): Promise<boolean> {
  const want = String(value || "").toLowerCase().trim();
  if (!want) return false;
  const name = String(f.hint || "");
  if (!name) return false;
  const radios = f.frame.locator(`input[type="radio"][name=${JSON.stringify(name)}]`);
  const n = await radios.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = radios.nth(i);
    const lab = await el
      .evaluate((e: any) => {
        const w = e.closest("label");
        return ((w && w.innerText) || e.getAttribute("aria-label") || e.value || "")
          .replace(/\s+/g, " ")
          .trim();
      })
      .catch(() => "");
    const l = String(lab).toLowerCase();
    if (l && (l.includes(want) || want.includes(l))) {
      await el.check({ timeout: 3000 }).catch(() => {});
      await pause(typeDelay());
      return true;
    }
  }
  return false;
}

/** The choices a radio group offers, if this label is one. */
export async function optionsForLabel(page: Page, label: string): Promise<string[] | undefined> {
  const want = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!want) return undefined;
  const fields = await detectAll(page);
  const name = (f: Field) => labelFor(f).toLowerCase().replace(/\s+/g, " ").trim();
  const hit = fields.find((f) => name(f) === want) || fields.find((f) => name(f).includes(want));
  return hit && hit.type === "radio" ? hit.options : undefined;
}

export async function fillFields(
  fields: Field[],
  profile: FillProfile,
): Promise<{ filled: number; skipped: string[] }> {
  let filled = 0;
  const skipped: string[] = [];

  for (const f of fields) {
    const value = answerFor(f, profile);
    if (!value) {
      if (f.required) skipped.push(labelFor(f));
      continue;
    }
    try {
      if (f.type === "radio") {
        if (await checkRadio(f, value)) filled++;
        else skipped.push(labelFor(f));
        continue;
      }
      const el = f.frame.locator(f.selector).first();
      if (f.type === "select") {
        const hit = (f.options || []).find((o) => o.toLowerCase().includes(value.toLowerCase()));
        if (!hit) { skipped.push(labelFor(f)); continue; }
        await el.selectOption(hit, { timeout: 3000 });
      } else {
        await el.fill(value, { timeout: 3000 });
      }
      filled++;
    } catch {
      skipped.push(labelFor(f));
    }
    /* A form filled in 40 ms is a bot. This is the only pacing that matters. */
    await pause(typeDelay());
  }

  return { filled, skipped };
}

/**
 * Fill one field by its visible label. Used when the user answers an ask:
 * the value came from them, so it is typed into the field they were asked
 * about rather than guessed from the profile.
 */
export async function fillByLabel(page: Page, label: string, value: string): Promise<boolean> {
  const want = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!want) return false;
  const fields = await detectAll(page);
  const name = (f: Field) => labelFor(f).toLowerCase().replace(/\s+/g, " ").trim();
  const hit =
    fields.find((f) => name(f) === want) ||
    fields.find((f) => `${f.label} ${f.hint}`.toLowerCase().replace(/\s+/g, " ").trim() === want) ||
    fields.find((f) => name(f).includes(want)) ||
    fields.find((f) => `${f.label} ${f.hint}`.toLowerCase().includes(want)) ||
    fields.find((f) => want.includes(name(f)) && name(f).length > 3);
  if (!hit) return false;
  try {
    if (hit.type === "radio") return await checkRadio(hit, value);
    const el = hit.frame.locator(hit.selector).first();
    if (hit.type === "select") {
      const opt = (hit.options || []).find((o) => o.toLowerCase().includes(value.toLowerCase()));
      if (!opt) return false;
      await el.selectOption(opt, { timeout: 3000 });
    } else {
      await el.fill(value, { timeout: 3000 });
    }
    await pause(typeDelay());
    return true;
  } catch {
    return false;
  }
}

const OTP_SELECTOR =
  'input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i], input[name*="code" i][maxlength="6"], input[inputmode="numeric"][maxlength="6"]';

/** True when the page is showing a one-time-code input. */
export async function hasOtpField(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      if ((await frame.locator(OTP_SELECTOR).count()) > 0) return true;
    } catch {
      /* cross-origin frame */
    }
  }
  return false;
}

/**
 * True only when a code is still needed: an OTP input exists and is empty.
 *
 * Some forms keep the code field on the same page as the rest of the
 * application, so "an OTP input exists" stays true after the user's code is
 * typed. Asking again would loop forever.
 */
export async function needsOtp(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    try {
      const inputs = frame.locator(OTP_SELECTOR);
      const n = await inputs.count();
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        const v = await el.inputValue().catch(() => "");
        if (!String(v || "").trim()) return true;
      }
    } catch {
      /* cross-origin frame */
    }
  }
  return false;
}

/** Type the code the user gave into the page's OTP input. */
export async function fillOtp(page: Page, code: string): Promise<boolean> {
  const digits = String(code || "").replace(/\s+/g, "");
  if (!digits) return false;
  for (const frame of page.frames()) {
    try {
      const input = frame.locator(OTP_SELECTOR).first();
      if ((await input.count()) === 0) continue;
      await input.fill(digits, { timeout: 5000 });
      await pause(typeDelay());
      return true;
    } catch {
      /* try the next frame */
    }
  }
  return false;
}

/**
 * True when the field matching this label already holds a value. Used so the
 * ask loop does not re-ask for a code or a field that was filled a moment ago.
 */
export async function fieldFilled(page: Page, label: string): Promise<boolean> {
  const want = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!want) return false;
  const fields = await detectAll(page);
  const name = (f: Field) => labelFor(f).toLowerCase().replace(/\s+/g, " ").trim();
  const hit =
    fields.find((f) => name(f) === want) ||
    fields.find((f) => `${f.label} ${f.hint}`.toLowerCase().replace(/\s+/g, " ").trim() === want) ||
    fields.find((f) => name(f).includes(want)) ||
    fields.find((f) => `${f.label} ${f.hint}`.toLowerCase().includes(want));
  if (!hit) return false;
  try {
    if (hit.type === "radio") {
      const radios = hit.frame.locator(`input[type="radio"][name=${JSON.stringify(String(hit.hint || ""))}]`);
      const n = await radios.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        if (await radios.nth(i).isChecked().catch(() => false)) return true;
      }
      return false;
    }
    const el = hit.frame.locator(hit.selector).first();
    if (hit.type === "select") {
      const v = await el.inputValue().catch(() => "");
      return Boolean(String(v || "").trim());
    }
    const v = await el.inputValue().catch(() => "");
    return Boolean(String(v || "").trim());
  } catch {
    return false;
  }
}

export async function fillApplication(opts: {
  url: string;
  profileDir: string;
  profile: FillProfile;
  /** Where the per-site form cache lives. Defaults to the profile's parent. */
  dataDir?: string;
}): Promise<FillResult> {
  if (!HAS_CHROME) {
    return { ok: false, filled: 0, skipped: [], needsHuman: "no-browser", message: "Chrome or Edge was not found on this machine." };
  }
  const host = hostOf(opts.url);
  /* One run per host at a time. Two tabs on the same board is what trips a
     rate limit, and serialising costs nothing when there is only one. */
  return serialise(host, () => fillInner(opts, host));
}

async function fillInner(
  opts: { url: string; profileDir: string; profile: FillProfile; dataDir?: string },
  host: string,
): Promise<FillResult> {
  const opened = await openVisible(opts.profileDir, opts.url);
  if (!opened.ok) {
    return { ok: false, filled: 0, skipped: [], message: opened.message || "The browser could not open the form." };
  }
  const page = currentPage();
  if (!page) {
    return { ok: false, filled: 0, skipped: [], message: "The browser is not open." };
  }

  try {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2000);

    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/captcha|are you a robot|verify you are human/.test(body)) {
      return { ok: false, filled: 0, skipped: [], needsHuman: "captcha", message: "The form asked for a bot check. Solve it in the browser panel; the fields are still yours to fill." };
    }

    let active = page;
    let fields = await detectAll(active);

    const dataDir = opts.dataDir || dirname(opts.profileDir);
    const cached = host ? await getForm(dataDir, host) : null;

    /* A board we have filled before: try its remembered fields before paying
       for a fresh detection pass. If none of them are on the page (the form is
       behind Apply, or the board changed), fall through and read it again. */
    if (cached) {
      const asFields: Field[] = cached.map((c) => ({ ...c, frame: page.mainFrame() }));
      const attempt = await fillFields(asFields, opts.profile);
      if (attempt.filled > 0) {
        return { ok: true, filled: attempt.filled, skipped: attempt.skipped, fromCache: true };
      }
    }

    if (!looksLikeApplication(fields)) {
      /* Description page: the form is behind Apply. Press it, then look again.
         A popup is picked up by the panel's own popup handler, so re-read the
         visible page rather than assuming it is still this one. */
      const clicked = await openForm(active);
      if (clicked) {
        await pause(actionDelay());
        await active.waitForTimeout(2500);
        active = currentPage() || active;
        await active.waitForLoadState("domcontentloaded").catch(() => {});
        await active.waitForTimeout(1500);
        fields = await detectAll(active);
      }
    }

    if (!looksLikeApplication(fields)) {
      return {
        ok: false,
        filled: 0,
        skipped: [],
        needsHuman: "not-a-form",
        message: "No application form was found, even after pressing Apply. The posting may be closed, or the form may need a sign-in first.",
      };
    }

    /* Remember the shape of this board's form so the next apply skips the
       discovery pass. Keyed by host: every posting on a board shares it. */
    if (host) {
      await putForm(dataDir, host, fields.map(({ frame: _frame, ...f }) => f as CachedField)).catch(() => {});
    }

    const { filled, skipped } = await fillFields(fields, opts.profile);

    /* leave the page open: the user reads it in the panel, attaches the PDF,
       submits */
    return { ok: true, filled, skipped };
  } catch (e) {
    return { ok: false, filled: 0, skipped: [], message: e instanceof Error ? e.message : String(e) };
  }
}

/** The form stays open on purpose; this only clears the panel. */
export async function closeFillWindow(): Promise<void> {
  const p = currentPage();
  if (p) await p.goto("about:blank", { timeout: 5000 }).catch(() => {});
}

export const FILLABLE_SOURCES = ["lever", "greenhouse", "ashby", "smartrecruiters"] as const;
