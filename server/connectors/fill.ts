// Fill an employer's own application form.
//
// This is the part of "Apply" that is genuinely useful: Lever, Greenhouse,
// Ashby and SmartRecruiters all render a plain HTML form, so the agent can put
// the candidate's confirmed details into it. It never presses submit. The
// window stays open so the user can read every field, attach the tailored PDF
// and send it themselves.
//
// Naukri is not here on purpose. Its apply flow is user-directed (ADR-013) and
// many of its buttons hand off to one of these ATS forms anyway, which is the
// case this file covers.

import type { Page } from "playwright-core";
import { HAS_CHROME, currentPage, openVisible } from "../lib/browser";

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
};

type Field = {
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

/* The form opens in the same browser the user sees inside Career-Ops, so the
   filled fields are visible in the panel rather than in a stray window. */
function answerFor(f: Field, p: FillProfile): string | undefined {
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

async function detect(page: Page): Promise<Field[]> {
  /* Passed as a string: esbuild's __name helper does not exist in the page. */
  return (await page.evaluate(`(() => {
    const out = [];
    const seen = new Set();
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
      if (!label) label = el.getAttribute("placeholder") || "";
      if (!label) {
        /* Only trust a container label when the container holds exactly one
           control. Climbing to a big div and taking its first label is how the
           candidate's name ended up in "What is your notice period". */
        let box = el.parentElement;
        for (let up = 0; up < 4 && box; up++, box = box.parentElement) {
          const controls = box.querySelectorAll("input, textarea, select").length;
          if (controls > 1) break;
          const lab = box.querySelector("label, legend, .label, [class*='label']");
          if (lab && (lab.innerText || "").trim()) { label = lab.innerText; break; }
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
        label: (label || name || "").replace(/\\s+/g, " ").trim().slice(0, 120),
        hint: String(name || "").slice(0, 120),
        type,
        required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
        options: el.tagName === "SELECT"
          ? Array.from(el.options).map((o) => o.value).filter(Boolean)
          : undefined
      });
    }
    return out;
  })()`)) as Field[];
}

export async function fillApplication(opts: {
  url: string;
  profileDir: string;
  profile: FillProfile;
}): Promise<FillResult> {
  if (!HAS_CHROME) {
    return { ok: false, filled: 0, skipped: [], needsHuman: "no-browser", message: "Chrome or Edge was not found on this machine." };
  }

  const opened = await openVisible(opts.profileDir, opts.url);
  if (!opened.ok) {
    return { ok: false, filled: 0, skipped: [], message: opened.message || "The browser could not open the form." };
  }
  const page = currentPage();
  if (!page) {
    return { ok: false, filled: 0, skipped: [], message: "The browser is not open." };
  }

  try {
    await page.waitForTimeout(2500);

    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/captcha|are you a robot|verify you are human/.test(body)) {
      return { ok: false, filled: 0, skipped: [], needsHuman: "captcha", message: "The form asked for a bot check. Solve it in the browser panel; the fields are still yours to fill." };
    }

    const fields = await detect(page);
    if (!fields.length) {
      return { ok: false, filled: 0, skipped: [], needsHuman: "not-a-form", message: "No fillable form was found on this page. It may load the form after a click, or it may be a listing page." };
    }

    let filled = 0;
    const skipped: string[] = [];

    for (const f of fields) {
      const value = answerFor(f, opts.profile);
      if (!value) {
        if (f.required) skipped.push(f.label || f.selector);
        continue;
      }
      try {
        const el = page.locator(f.selector).first();
        if (f.type === "select") {
          const hit = (f.options || []).find((o) => o.toLowerCase().includes(value.toLowerCase()));
          if (!hit) { skipped.push(f.label || f.selector); continue; }
          await el.selectOption(hit, { timeout: 3000 });
        } else if (f.type === "textarea") {
          await el.fill(value, { timeout: 3000 });
        } else {
          await el.fill(value, { timeout: 3000 });
        }
        filled++;
      } catch {
        skipped.push(f.label || f.selector);
      }
    }

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
