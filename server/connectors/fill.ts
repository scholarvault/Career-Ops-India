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
  postalCode?: string;
  state?: string;
  country?: string;
  linkedin?: string;
  website?: string;
  currentCompany?: string;
  currentTitle?: string;
  years?: number;
  /** Typed explicitly by the user. Never estimated or guessed. */
  currentCtc?: string;
  /** Typed by the user on the apply page. Never generated. */
  expectedCtc?: string;
  /** Typed explicitly by the user (e.g. "30 days", "Immediate"). Never guessed. */
  noticePeriod?: string;
  /** Explicit user preferences. Never estimated or guessed. */
  preferredWorkMode?: string;
  willingToRelocate?: string;
  workAuthorization?: string;
  preferredLocality?: string;
  institution?: string;
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
  combobox?: boolean;
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

function normalizeForField(f: RawField, value: string): string {
  if (f.type !== "number") return value;
  const v = String(value || "").trim();
  const l = `${f.label} ${f.hint}`.toLowerCase();
  if (/^immediate\b/i.test(v) && /\b(notice|day|join)\b/.test(l)) return "0";
  const m = v.match(/(\d+(?:\.\d+)?)/);
  return m?.[1] ?? v;
}

const INDIAN_CITIES =
  /^(chennai|bengaluru|bangalore|hyderabad|mumbai|navi mumbai|pune|delhi|new delhi|noida|gurugram|gurgaon|kolkata|ahmedabad|coimbatore|kochi|thiruvananthapuram|madurai|tiruchirappalli|trichy|salem|hosur|jaipur|thiruvottiyur)$/i;
const TN_CITIES = /^(chennai|coimbatore|madurai|tiruchirappalli|trichy|salem|hosur|vellore|erode|thiruvottiyur)$/i;

/* The form opens in the same browser the user sees inside Career-Ops, so the
   filled fields are visible in the panel rather than in a stray window. */
function answerFor(f: RawField, p: FillProfile): string | undefined {
  const l = `${f.label} ${f.hint}`.toLowerCase();
  const country =
    p.country ||
    (/\bindia\b/i.test(p.workAuthorization || "") || INDIAN_CITIES.test((p.city || "").trim())
      ? "India"
      : undefined);
  const state = p.state || (TN_CITIES.test((p.city || "").trim()) ? "Tamil Nadu" : undefined);

  if (f.type === "email" || /\be-?mail\b/.test(l)) return p.email;
  if (/\b(country\s*code|dial\s*code|phone\s*code|calling\s*code)\b/.test(l)) {
    return /^\+?91/.test(p.phone || "") || country === "India" ? "+91" : undefined;
  }
  if (f.type === "tel" || /\b(phone|mobile|contact number)\b/.test(l)) return p.phone;
  if (/\b(first name|given name)\b/.test(l)) return p.fullName?.split(/\s+/)[0];
  if (/\b(last name|surname|family name)\b/.test(l)) return p.fullName?.split(/\s+/).slice(1).join(" ");
  if (/\b(full name|your name|^name\b|\bname\b)/.test(l) && !/company|file|user|middle/.test(l)) return p.fullName;
  if (/\blinkedin\b/.test(l)) return p.linkedin;
  if (/\b(github|portfolio|website|personal site|url)\b/.test(l)) return p.website;
  if (f.type !== "radio" && /\b(country|nation)\b/.test(l) && !/\b(code|dial|phone|authori[sz]ed|eligible|citizen)\b/.test(l)) {
    return country;
  }
  if (f.type !== "radio" && /\b(state|province|region)\b/.test(l) && !/\b(statement|status|relocat)\b/.test(l)) {
    return state;
  }
  if (f.type !== "radio" && /\b(pin\s*code|postal\s*code|pincode|zip\s*code|postal)\b/.test(l) && p.postalCode) {
    return p.postalCode;
  }
  if (f.type !== "radio" && f.combobox && /\bpreferred\b.*\boffice\b.*\blocations?\b/.test(l)) {
    return p.city;
  }
  if (f.type !== "radio" && /\b(city|current location|location|where are you based)\b/.test(l) && !/\b(onsite|willing|able to|relocat|commute|preferred location|office|dropdown|filter)\b/.test(l)) return p.city;
  if (/\b(current|present) (company|employer)\b/.test(l)) return p.currentCompany;
  if (/\b(current|present) (title|role|designation)\b/.test(l)) return p.currentTitle;
  if (
    f.type !== "textarea" &&
    !/\b(describe|explain|tell us|summary|details|company|employer|organization|notice)\b/.test(l) &&
    /\b(years(\s+of)?(\s+\w+){0,4}\s*experience|(total|relevant|work|overall|professional)\s*(?:\w+\s+){0,2}experience|experience\s*\(?\s*(in\s*)?years\)?)\b/.test(l) &&
    p.years !== undefined
  ) return String(p.years);
  /* Only numbers explicitly provided by the user. Never estimated or guessed. */
  if (/\b(current|present)\s*(ctc|salary|compensation)\b/.test(l) && p.currentCtc) return normalizeForField(f, p.currentCtc);
  if (/\b(expected|desired|target)\s*(ctc|salary|compensation)\b/.test(l) && p.expectedCtc) return normalizeForField(f, p.expectedCtc);
  if (/\b(notice\s*period|how soon can you join|joining availability)\b/.test(l) && p.noticePeriod) return normalizeForField(f, p.noticePeriod);
  if (/\b(willing|able|open)\s+to\s+relocat/i.test(l) && p.willingToRelocate) return p.willingToRelocate;
  if (/\b(authorized|eligible)\s+to\s+work/i.test(l) && p.workAuthorization) return p.workAuthorization;
  if (/\b(work\s*mode|preferred\s+work\s*(arrangement|mode|setting))\b/i.test(l) && p.preferredWorkMode) return p.preferredWorkMode;
  if (f.type !== "textarea" && !/\b(url|site|website|year|date)\b/.test(l) && /\b(institution|university|college|school)\b/.test(l) && p.institution) return p.institution;
  /* "why this role": only the user can answer this */
  return undefined;
}

/* Passed as a string: esbuild's __name helper does not exist in the page. */
const RADIO_LABEL_JS = `(e) => {
  const w = e.closest("label");
  if (w && (w.innerText || "").trim()) return w.innerText.replace(/\\s+/g, " ").trim();
  if (e.id) {
    const r = e.getRootNode ? e.getRootNode() : document;
    const fl = (r.querySelector ? r.querySelector('label[for="' + CSS.escape(e.id) + '"]') : null)
      || document.querySelector('label[for="' + CSS.escape(e.id) + '"]');
    if (fl && (fl.innerText || "").trim()) return fl.innerText.replace(/\\s+/g, " ").trim();
  }
  const aria = (e.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim();
  if (aria) return aria;
  const p = e.closest("[class*='option'], [class*='radio'], li") || e.parentElement;
  const pTxt = p ? (p.innerText || "").replace(/\\s+/g, " ").trim() : "";
  if (pTxt && pTxt.length <= 80) return pTxt;
  const v = (e.value || "").replace(/\\s+/g, " ").trim();
  return v && v !== "on" ? v : "";
}`;

const DETECT = `(() => {
  const radioLabel = ${RADIO_LABEL_JS};
  const out = [];
  const seen = new Set();
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

  const isVisible = (el) => {
    try {
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      if (el.closest && el.closest('[hidden], [aria-hidden="true"]')) return false;
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (rect && (rect.width === 0 || rect.height === 0)) return false;
      if (!rect && el.offsetParent === null) return false;
      return true;
    } catch {
      return el.offsetParent !== null;
    }
  };

  const makeSelector = (el) => {
    const hosts = [];
    let node = el;
    while (node) {
      const rn = node.getRootNode ? node.getRootNode() : null;
      if (!rn || !rn.host) break;
      const h = rn.host;
      let hSel = "";
      if (h.id) hSel = "#" + CSS.escape(h.id);
      else if (h.getAttribute("data-test")) hSel = '[data-test=' + JSON.stringify(h.getAttribute("data-test")) + ']';
      else if (h.getAttribute("data-testid")) hSel = '[data-testid=' + JSON.stringify(h.getAttribute("data-testid")) + ']';
      else if (h.getAttribute("name")) hSel = h.tagName.toLowerCase() + '[name=' + JSON.stringify(h.getAttribute("name")) + ']';
      else if (h.getAttribute("label")) hSel = h.tagName.toLowerCase() + '[label=' + JSON.stringify(h.getAttribute("label")) + ']';
      else {
        let idx = 1;
        for (let s = h.previousElementSibling; s; s = s.previousElementSibling) {
          if (s.tagName === h.tagName) idx++;
        }
        hSel = h.tagName.toLowerCase() + ':nth-of-type(' + idx + ')';
        const p = h.parentElement;
        if (p && p !== document.body && p !== document.documentElement) {
          if (p.id) hSel = "#" + CSS.escape(p.id) + " > " + hSel;
          else if (p.getAttribute("data-test")) hSel = '[data-test=' + JSON.stringify(p.getAttribute("data-test")) + '] > ' + hSel;
        }
      }
      hosts.unshift(hSel);
      node = h;
    }
    const name = el.getAttribute("name") || "";
    const dt = el.getAttribute("data-test") || "";
    const aria = el.getAttribute("aria-label") || "";
    const ph = el.getAttribute("placeholder") || "";
    let leaf = "";
    if (!hosts.length && el.id) leaf = "#" + CSS.escape(el.id);
    else if (dt) leaf = '[data-test=' + JSON.stringify(dt) + ']';
    else if (name) leaf = '[name=' + JSON.stringify(name) + ']';
    else if (aria) leaf = '[aria-label=' + JSON.stringify(aria) + ']';
    else if (el.id) leaf = "#" + CSS.escape(el.id);
    else if (ph) leaf = '[placeholder=' + JSON.stringify(ph) + ']';
    else if (hosts.length) leaf = el.tagName.toLowerCase();
    if (!leaf) return "";
    return hosts.length ? (hosts.join(" ") + " " + leaf) : leaf;
  };

  /* Radio groups are one question with a few choices. Detect them as a single
     field so the ask can offer the choices instead of asking for free text. */
  const isRadioVisible = (el) => {
    if (isVisible(el)) return true;
    const w = el.closest("label");
    if (w && isVisible(w)) return true;
    if (el.id) {
      const r = el.getRootNode ? el.getRootNode() : document;
      const fl = (r.querySelector ? r.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null)
        || document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (fl && isVisible(fl)) return true;
    }
    return false;
  };
  const groups = new Map();
  for (const el of qsa(document, 'input[type="radio"]')) {
    if (el.disabled || !isRadioVisible(el)) continue;
    const n = el.getAttribute("name") || "";
    if (!n) continue;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(el);
  }
  for (const [n, els] of groups) {
    const options = els.map((e) => radioLabel(e)).filter(Boolean);
    let label = "";
    let holderReq = false;
    const rg = els[0].closest('[role="radiogroup"]');
    let rgLabel = "";
    if (rg && rg.getAttribute("aria-labelledby")) {
      const ids = rg.getAttribute("aria-labelledby").split(/\\s+/);
      rgLabel = ids
        .map((id) => {
          const rn = els[0].getRootNode ? els[0].getRootNode() : document;
          const nd = (rn.getElementById ? rn.getElementById(id) : null) || document.getElementById(id);
          return nd ? (nd.innerText || "") : "";
        })
        .join(" ")
        .replace(/\\s+/g, " ")
        .trim();
    }
    const holder =
      els[0].closest("[class*='question'], fieldset") ||
      els[0].closest("li, [class*='field'], [data-testid*='field' i], [class*='formItem' i], [class*='RadioGroup' i]");
    if (rgLabel) {
      label = rgLabel;
      holderReq = /[*✱∗]/.test(rgLabel) || Boolean(holder && holder.querySelector('[class*="required" i], [class*="asterisk" i], [aria-required="true"]'));
      label = label.replace(/[✱∗*]/g, "").replace(/\\s+/g, " ").trim();
    } else if (holder) {
      const rawHolder = (holder.innerText || "").replace(/\\s+/g, " ").trim();
      label = rawHolder;
      for (const o of options) label = label.split(o).join(" ");
      /* A wrapper can hold several questions; check for * on the question slice BEFORE stripping. */
      const qSlice = label.indexOf("?") > 0 && label.indexOf("?") < 140
        ? label.slice(0, label.indexOf("?") + 3)
        : label;
      holderReq = /[*✱∗]/.test(qSlice) || Boolean(holder.querySelector('[class*="required" i], [class*="asterisk" i], [aria-required="true"]'));
      label = label.replace(/[✱∗*]/g, "").replace(/\\s+/g, " ").trim();
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
      required: holderReq || els.some((e) => e.hasAttribute("required") || e.getAttribute("aria-required") === "true"),
      options
    });
  }

  const nodes = qsa(document, "input, textarea, select");
  for (const el of nodes) {
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (["hidden", "submit", "button", "reset", "search", "checkbox", "radio", "file"].includes(type)) continue;
    if (el.disabled || el.readOnly) continue;
    if (!isVisible(el)) continue;
    const rawAria = el.getAttribute("aria-label") || "";
    if (/job-details-location-dropdown|search\s+jobs|location\s*filter/i.test(rawAria)) continue;

    let label = "";
    const root = el.getRootNode ? el.getRootNode() : document;
    const host = root && root.host ? root.host : null;
    if (el.id) {
      const lab = (root.querySelector ? root.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null)
        || document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
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
        const n = (root.getElementById ? root.getElementById(id) : null) || document.getElementById(id);
        return n ? (n.innerText || "") : "";
      }).join(" ").trim();
    }
    if (!label) {
      /* A placeholder like "Type your response" is not a label; it is the
         widget's default text. Ignoring it lets the container climb below
         find the real question ("What is your current CTC?"). */
      const ph = (el.getAttribute("placeholder") || "").replace(/\\s+/g, " ").trim();
      if (ph && !/^(type your response|enter your (answer|response)|your (answer|response)|start typing|type to search|type here|choose an option|select an option|answer|response|text|input|select)\\.{0,3}$/i.test(ph)) {
        label = ph;
      }
    }
    if (!label && host) {
      label = host.getAttribute("label")
        || host.getAttribute("aria-label")
        || host.getAttribute("placeholder")
        || (host.querySelector && (host.querySelector("label, [slot='label'], .label, [class*='label']")?.innerText || ""))
        || "";
    }
    if (!label) {
      /* Only trust a container label when the container holds exactly one
         control. Climbing to a big div and taking its first label is how the
         candidate's name ended up in "What is your notice period". */
      let box = el.parentElement || host;
      for (let up = 0; up < 6 && box; up++) {
        const controls = box.querySelectorAll ? box.querySelectorAll("input, textarea, select, spl-input, spl-autocomplete, spl-phone-field").length : 0;
        if (controls > 1) break;
        const lab = box.querySelector ? box.querySelector("label, legend, .label, [class*='label'], h1, h2, h3, h4, h5, h6") : null;
        if (lab && (lab.innerText || "").trim()) { label = lab.innerText; break; }
        /* Lever's custom cards put the question in a plain div, not a label.
           With one control in the box, that text is the question. */
        const own = (box.innerText || "").replace(/\\s+/g, " ").trim();
        if (own && own.length <= 140) { label = own; break; }
        box = box.parentElement || (box.getRootNode && box.getRootNode().host) || null;
      }
    }

    const hintParts = [
      el.getAttribute("name") || "",
      el.id || "",
      el.getAttribute("data-test") || "",
      host ? (host.getAttribute("name") || host.getAttribute("data-test") || host.id || "") : "",
    ].filter(Boolean);
    const name = hintParts[0] || "";
    const selector = makeSelector(el);
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);

    const hostReq = Boolean(host && (host.hasAttribute("required") || host.getAttribute("aria-required") === "true"));
    const labelReq = /[✱∗*]\s*$/.test(label || "");
    const combobox =
      el.getAttribute("role") === "combobox" ||
      Boolean(el.getAttribute("aria-autocomplete")) ||
      /react-select/i.test(el.id || "") ||
      Boolean(host && /autocomplete/i.test(host.tagName));
    out.push({
      selector,
      label: (label || name || "").replace(/[✱∗]/g, "").replace(/\\s+/g, " ").trim().slice(0, 120),
      hint: hintParts.join(" ").slice(0, 120),
      type,
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true" || hostReq || labelReq,
      ...(combobox ? { combobox: true } : {}),
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
  const nodes = qsa(document, 'a, button, [role="button"], input[type="button"], input[type="submit"], spl-button, oc-button');
  for (const el of nodes) {
    const disabled = el.disabled || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
    if (disabled) continue;
    const t = (el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || el.getAttribute("label") || "").replace(/\\s+/g, " ").trim();
    if (!t || t.length > 48) continue;
    if (!rx.test(t)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const inner = el.shadowRoot ? el.shadowRoot.querySelector('a, button, [role="button"], input[type="submit"]') : null;
    (inner || el).click();
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
function matchOption(options: string[], value: string, label = ""): string | undefined {
  const want = String(value || "").toLowerCase().trim();
  if (!want || !options.length) return undefined;
  const exact = options.find((o) => o.toLowerCase().trim() === want);
  if (exact) return exact;
  const sub = options.find((o) => {
    const t = o.toLowerCase().trim();
    return Boolean(t) && (t.includes(want) || (t.length >= 2 && want.includes(t)));
  });
  if (sub) return sub;

  if (/\b(authorized|eligible|yes)\b/i.test(want)) {
    const yesOpt = options.find((o) => /^yes\b/i.test(o.trim()));
    if (yesOpt && options.some((o) => /^no\b/i.test(o.trim()))) return yesOpt;
  }

  const isYears = /\b(years|experience)\b/i.test(label) && /^\d+(?:\.\d+)?$/.test(want);
  if (isYears) {
    const yrs = Number(want);
    for (const o of options) {
      const mRange = o.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)/i);
      if (mRange && yrs >= Number(mRange[1]) && yrs <= Number(mRange[2])) return o;
    }
    let bestPlus: { opt: string; floor: number } | null = null;
    for (const o of options) {
      const mPlus = o.match(/(\d+(?:\.\d+)?)\s*\+/);
      if (mPlus) {
        const floor = Number(mPlus[1]);
        if (yrs >= floor && (!bestPlus || floor > bestPlus.floor)) bestPlus = { opt: o, floor };
      }
    }
    if (bestPlus) return bestPlus.opt;
  }
  return undefined;
}

async function checkRadio(f: Field, value: string): Promise<boolean> {
  const want = String(value || "").toLowerCase().trim();
  if (!want) return false;
  const name = String(f.hint || "");
  if (!name) return false;
  const radios = f.frame.locator(`input[type="radio"][name=${JSON.stringify(name)}]`);
  const n = await radios.count().catch(() => 0);
  const radioLabel = new Function("e", "return (" + RADIO_LABEL_JS + ")(e)") as (e: any) => string;
  const labels: string[] = [];
  for (let i = 0; i < n; i++) {
    const lab = await radios.nth(i).evaluate(radioLabel).catch(() => "");
    labels.push(String(lab));
  }
  const picked = matchOption(labels, value, `${f.label} ${f.hint}`);
  if (picked) {
    const idx = labels.indexOf(picked);
    if (idx >= 0) {
      const target = radios.nth(idx);
      const targetVis = await target.isVisible().catch(() => false);
      if (targetVis) {
        await target.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
        await target.check({ timeout: 1500, force: true }).catch(() => {});
      }
      const isChecked = await target.isChecked({ timeout: 500 }).catch(() => false);
      if (!isChecked) {
        await target.evaluate((e: any) => {
          /* runs in the page; the server is compiled without the DOM lib */
          const document = (globalThis as any).document;
          const CSS = (globalThis as any).CSS;
          const r = e.getRootNode ? e.getRootNode() : document;
          const lbl = e.closest("label")
            || (e.id ? (r.querySelector?.('label[for="' + CSS.escape(e.id) + '"]') || document.querySelector('label[for="' + CSS.escape(e.id) + '"]')) : null);
          if (lbl) lbl.click();
          else e.click();
        }).catch(() => {});
        if (!(await target.isChecked({ timeout: 500 }).catch(() => false))) {
          await target.check({ timeout: 1200, force: true }).catch(() => {});
        }
      }
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

/** True when a detected control (input, select, radio, or React-Select combobox) already holds a value. */
async function hasFieldValue(f: Field): Promise<boolean> {
  if (f.type === "radio") {
    const radios = f.frame.locator(`input[type="radio"][name=${JSON.stringify(String(f.hint || ""))}]`);
    const n = await radios.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      if (await radios.nth(i).isChecked({ timeout: 500 }).catch(() => false)) return true;
    }
    return false;
  }
  const el = f.frame.locator(f.selector).first();
  if ((await el.count().catch(() => 0)) === 0) return false;
  const raw = String(await el.inputValue({ timeout: 500 }).catch(() => "")).trim();
  if (raw) return true;
  if (f.combobox) {
    const picked = await el
      .evaluate((e: any) => {
        let box: any = e.parentElement;
        for (let up = 0; up < 5 && box; up++, box = box.parentElement) {
          if (box.matches && box.matches("form")) break;
          const comboCount = box.querySelectorAll ? box.querySelectorAll('input[role="combobox"], [role="combobox"], select').length : 0;
          if (comboCount > 1) break;
          const valEl = box.querySelector('[class*="singleValue"], [class*="single-value"], [class*="multiValue"], [class*="multi-value"], [class*="value-container--has-value"], spl-chip');
          const txt = (valEl?.innerText || "").replace(/\s+/g, " ").trim();
          if (txt && !/^(select|choose|search)\b/i.test(txt)) return txt;
        }
        return "";
      })
      .catch(() => "");
    return Boolean(picked);
  }
  return false;
}

/** Pick and commit an option inside React-Select, ARIA combobox, or SPL autocomplete controls. */
async function fillCombobox(f: Field, value: string): Promise<boolean> {
  const el = f.frame.locator(f.selector).first();
  const want = String(value || "").trim();
  if (!want) return false;
  try {
    if ((await el.count().catch(() => 0)) === 0) return false;
    await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    await el.click({ timeout: 3000, force: true });
    await el.fill("", { timeout: 2000 }).catch(() => {});
    await el.type(want, { delay: 25, timeout: 3000 });
    await pause(650);

    const optSel = '[role="option"], [id*="-option-"], [class*="-option"], spl-dropdown-item, [role="listbox"] li';
    const scopes = [f.frame, f.frame.page().mainFrame()];
    for (const scope of scopes) {
      const opts = scope.locator(optSel);
      const count = await opts.count().catch(() => 0);
      if (!count) continue;
      const visible: Array<{ idx: number; text: string }> = [];
      for (let i = 0; i < Math.min(count, 40); i++) {
        const item = opts.nth(i);
        if (!(await item.isVisible().catch(() => false))) continue;
        const txt = (await item.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
        if (txt && !/^no options$/i.test(txt)) visible.push({ idx: i, text: txt });
      }
      if (!visible.length) continue;
      const texts = visible.map((v) => v.text);
      const matched =
        matchOption(texts, want, `${f.label} ${f.hint}`) ||
        visible.find((v) => v.text.toLowerCase().includes(want.toLowerCase()))?.text;
      const chosen = matched ? visible.find((v) => v.text === matched) : undefined;
      if (chosen) {
        await opts.nth(chosen.idx).click({ timeout: 3000 });
        await pause(typeDelay());
        return true;
      }
    }
    await el.press("Escape", { timeout: 500 }).catch(() => {});
    return false;
  } catch {
    return false;
  }
}

/** Fill one field cleanly (handles radios, native selects, searchable comboboxes, and local Indian phone inputs). */
async function fillControl(f: Field, rawValue: string): Promise<boolean> {
  try {
    if (f.type === "radio") return await checkRadio(f, rawValue);
    const el = f.frame.locator(f.selector).first();
    if (f.type === "select") {
      const hit = matchOption(f.options || [], rawValue, `${f.label} ${f.hint}`);
      if (!hit) return false;
      await el.selectOption(hit, { timeout: 3000 });
      await pause(typeDelay());
      return true;
    }
    if (f.combobox) {
      if (await fillCombobox(f, rawValue)) {
        /* Allow cascading dependent dropdowns (e.g. Country -> State -> City) to populate before the next field runs. */
        await pause(750);
        return true;
      }
      if (/\b(city|state|province|postal|pin|office)\b/i.test(`${f.label} ${f.hint}`) && (await el.count().catch(() => 0)) > 0) {
        await pause(800);
        if (await fillCombobox(f, rawValue)) {
          await pause(650);
          return true;
        }
      }
      return false;
    }
    let val = normalizeForField(f, rawValue);
    if (f.type === "tel" || /\b(phone|mobile|contact number)\b/i.test(`${f.label} ${f.hint}`)) {
      const wantsLocal = await el
        .evaluate((e: any) => {
          const ph = String(e.getAttribute("placeholder") || "");
          if (/^X+[\s-]*X+$|10\s*digit|^\d{5}\s*\d{5}$/i.test(ph.trim())) return true;
          const wrap = e.closest("[class*='phone' i], [class*='Phone' i], .field, div");
          return Boolean(wrap && /\+91\b/.test(wrap.innerText || ""));
        })
        .catch(() => false);
      if (wantsLocal) val = val.replace(/^\+?91[\s.-]*/, "").replace(/[^\d]/g, "");
    }
    await el.fill(val, { timeout: 3000 });
    await pause(typeDelay());
    return true;
  } catch {
    return false;
  }
}

export async function fillFields(
  fields: Field[],
  profile: FillProfile,
): Promise<{ filled: number; skipped: string[] }> {
  let filled = 0;
  let skipped: string[] = [];

  const runPass = async (list: Field[], countExisting: boolean) => {
    const passSkipped: string[] = [];
    let comboboxFilled = false;
    let newlyFilled = 0;
    const seen = new Set<string>();
    for (const f of list) {
      const key = `${f.selector}::${labelFor(f)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      /* Respect values already populated by an ATS resume parser or browser autofill. */
      if (await hasFieldValue(f)) {
        if (countExisting) filled++;
        continue;
      }

      const value = answerFor(f, profile);
      if (!value) {
        if (f.required) passSkipped.push(labelFor(f));
        continue;
      }
      if (await fillControl(f, value)) {
        filled++;
        newlyFilled++;
        if (f.combobox) comboboxFilled = true;
      } else {
        passSkipped.push(labelFor(f));
      }
    }
    return { passSkipped, comboboxFilled, newlyFilled };
  };

  let cur = await runPass(fields, true);
  skipped = cur.passSkipped;

  /* Cascading dropdowns (e.g. Country -> State -> City) can unmount and remount
     child inputs once a parent is selected, invalidating earlier selectors. */
  const page = fields[0]?.frame?.page();
  for (let pass = 0; pass < 2 && page && cur.comboboxFilled; pass++) {
    const fresh = await detectAll(page).catch(() => []);
    if (!fresh.length) break;
    cur = await runPass(fresh, false);
    skipped = cur.passSkipped;
    if (!cur.newlyFilled && !cur.comboboxFilled) break;
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
  return fillControl(hit, value);
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
  return hasFieldValue(hit);
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
