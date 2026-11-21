// What the master resume said before tailoring.
//
// The tailor drawer has to show a real before/after, not a claim. The master
// resume is a PDF whose text order is not always the visual order, so this
// reads it by section heading instead of by position. It is deliberately
// forgiving: when a heading is missing it returns nothing rather than a guess,
// and the UI simply hides that row.

export type BaselineRole = { line: string; dates: string };

export type Baseline = {
  summary: string;
  skills: string[];
  roles: BaselineRole[];
  certifications: string[];
  languages: string[];
  bullets: number;
};

const HEADING_RES = [
  /^PROFILE\b/i,
  /^PROFESSIONAL SUMMARY\b/i,
  /^SUMMARY\b/i,
  /^ABOUT\b/i,
  /^VENTURE BUILDING\b/i,
  /^PLATFORM OPERATIONS\b/i,
  /^ECOSYSTEM INITIATIVES\b/i,
  /^TECHNICAL CAPABILITIES\b/i,
  /^TECHNICAL SKILLS\b/i,
  /^SKILLS\b/i,
  /^CORE COMPETENCIES\b/i,
  /^WORK EXPERIENCE\b/i,
  /^EXPERIENCE\b/i,
  /^PROJECTS\b/i,
  /^EDUCATION\b/i,
  /^CERTIFICATIONS?\b/i,
  /^LANGUAGES\b/i,
];

/* Longest first, so "PROFESSIONAL SUMMARY" wins over "SUMMARY". */
const HEADING_WORDS = [
  "PROFESSIONAL SUMMARY",
  "TECHNICAL CAPABILITIES",
  "TECHNICAL SKILLS",
  "CORE COMPETENCIES",
  "VENTURE BUILDING",
  "PLATFORM OPERATIONS",
  "ECOSYSTEM INITIATIVES",
  "WORK EXPERIENCE",
  "CERTIFICATIONS",
  "CERTIFICATION",
  "EXPERIENCE",
  "LANGUAGES",
  "EDUCATION",
  "PROJECTS",
  "PROFILE",
  "SUMMARY",
  "SKILLS",
  "ABOUT",
];

/**
 * A two-column PDF can print two headings on one visual line
 * ("EDUCATION CERTIFICATIONS"). Split those back into separate lines so the
 * section reader sees each heading.
 */
function splitHeadings(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || !/^[A-Z& ]+$/.test(t)) {
      out.push(line);
      continue;
    }
    const words = t.split(/\s+/);
    const parts: string[] = [];
    let pending: string[] = [];
    let i = 0;
    while (i < words.length) {
      let hit = "";
      for (const h of HEADING_WORDS) {
        const hw = h.split(" ");
        if (hw.every((w, k) => words[i + k] === w) && h.length > hit.length) hit = h;
      }
      if (hit) {
        if (pending.length) {
          parts.push(pending.join(" "));
          pending = [];
        }
        parts.push(hit);
        i += hit.split(" ").length;
      } else {
        pending.push(words[i]);
        i++;
      }
    }
    if (pending.length) parts.push(pending.join(" "));
    out.push(...(parts.length > 1 ? parts : [line]));
  }
  return out;
}

const EDU_HINT =
  /university|institute|college|school|academy|speciali[sz]ation|bachelor|master|b\.?tech|mba|bca|b\.?sc|degree/i;
const CERT_HINT = /certif|·.*\(\d{4}\)|\(\d{4}\)/i;

/** "English: Professional Working Proficiency Tamil: Native Proficiency" */
function splitLanguages(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const parts = l
      .split(/(?=\b[A-Z][a-z]+:\s)/)
      .map((s) => s.trim())
      .filter(Boolean);
    out.push(...(parts.length > 1 ? parts : [l]));
  }
  return out;
}

const DATE_RANGE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|~\s*\d{4}|\b\d{4}\b)\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|~\s*\d{4}|Present|Current|\b\d{4}\b)/i;

const isHeading = (line: string) => line.length <= 72 && HEADING_RES.some((re) => re.test(line));

const isFooter = (line: string) => /PAGE\s+\d+\s+OF\s+\d+/i.test(line);

/** Short ALL-CAPS labels such as "FLAGSHIP VENTURE" or "ACADEMIC BASE". */
function isTag(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, "");
  const upper = line.replace(/[^A-Z]/g, "");
  return letters.length >= 3 && line.length <= 48 && upper.length / letters.length > 0.85;
}

function linesOf(text: string): string[] {
  return String(text || "")
    .split(/\r?\n|\t/)
    .map((l) => l.replace(/[^\S\t]+/g, " ").trim());
}

/** Drop a trailing two-word ALL-CAPS label ("FLAGSHIP VENTURE"). A longer
    run is usually a company name plus a label, so leave it alone. */
function stripTags(line: string): string {
  const words = line.trim().split(/\s+/);
  let start = words.length;
  while (start > 0 && /^[A-Z&]+$/.test(words[start - 1])) start--;
  const run = words.length - start;
  if (run === 2 && start >= 2 && /[a-z]/.test(words[start - 1])) {
    return words.slice(0, start).join(" ");
  }
  return line.trim();
}

/** Lines after `startRe`, stopping at the next section heading or page footer. */
function sectionAfter(lines: string[], startRe: RegExp): string[] {
  const at = lines.findIndex((l) => startRe.test(l));
  if (at < 0) return [];
  const out: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (isFooter(l)) break;
    if (isHeading(l) && !startRe.test(l)) break;
    out.push(l);
  }
  return out;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = v.toLowerCase().replace(/[^a-z0-9+#. ]/g, " ").replace(/\s+/g, " ").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function resumeBaseline(text: string): Baseline {
  const lines = splitHeadings(linesOf(text));

  /* Summary: the prose under PROFILE / SUMMARY, minus the small caps tags. */
  const summaryLines = sectionAfter(lines, /^(PROFILE|PROFESSIONAL SUMMARY|SUMMARY|ABOUT)$/i)
    .filter((l) => !isTag(l) && l.length > 24);
  const summaryFull = summaryLines.join(" ").replace(/\s+/g, " ").trim();
  /* cut on a sentence, never mid-word */
  const summary =
    summaryFull.length <= 1400
      ? summaryFull
      : summaryFull.slice(0, 1400).replace(/\s+\S*$/, "").replace(/[.,;:]$/, "") + "…";

  /* Skills: the TECHNICAL CAPABILITIES block. A PDF often prints a whole
     group on one long line ("AI & Automation: Cursor, TypeScript, MCP, ..."),
     so split on the group label and the separators instead of dropping any
     line longer than 60 characters. That old cap is why the drawer said
     "37 added" for skills the master resume already listed. */
  const skillSection = sectionAfter(
    lines,
    /^(TECHNICAL CAPABILITIES|TECHNICAL SKILLS|SKILLS|CORE COMPETENCIES)\b/i
  ).filter((l) => !isTag(l) && !DATE_RANGE.test(l) && !/^[A-Z &/]+$/.test(l));
  const skillParts: string[] = [];
  for (const line of skillSection) {
    const body = line
      .replace(/^[A-Za-z0-9 &/+#().'-]{2,44}:\s*/, "")
      .replace(/\s*›\s*$/, "")
      .trim();
    if (!body) continue;
    for (const p of body.split(/\s*[,;|·]\s*|\s{3,}/)) {
      const t = p.trim().replace(/^[-–—]\s*/, "");
      if (t.length >= 2 && t.length <= 70 && !/^\d+$/.test(t)) skillParts.push(t);
    }
  }
  const skills = uniq(skillParts).slice(0, 90);

  /* Roles: a date range, then the role text on the same line or just above.
     Stop at EDUCATION so a degree's dates are not read as a job. */
  const eduAt = lines.findIndex((l) => /^EDUCATION\b/i.test(l));
  const rolesEnd = eduAt < 0 ? lines.length : eduAt;
  const roles: BaselineRole[] = [];
  for (let i = 0; i < rolesEnd; i++) {
    const dates = lines[i].match(DATE_RANGE);
    if (!dates) continue;
    const before = lines[i].slice(0, dates.index).trim();
    const sameLine = stripTags(before);
    if (sameLine.length >= 6 && !isTag(sameLine) && !/^[|·–—-]+$/.test(sameLine)) {
      roles.push({ line: sameLine, dates: dates[0].replace(/\s+/g, " ").trim() });
      continue;
    }
    for (let back = 1; back <= 5; back++) {
      const cand = lines[i - back];
      if (!cand) continue;
      if (isTag(cand) || isHeading(cand) || isFooter(cand) || DATE_RANGE.test(cand)) continue;
      if (cand.length < 4 || cand.length > 90) continue;
      /* a degree is not a role */
      if (EDU_HINT.test(cand)) continue;
      roles.push({ line: stripTags(cand), dates: dates[0].replace(/\s+/g, " ").trim() });
      break;
    }
  }

  /* When EDUCATION and CERTIFICATIONS share a heading, their lines are
     interleaved. Keep only the lines that read like a certification. */
  const certSection = sectionAfter(lines, /^CERTIFICATIONS?$/i);
  const certsRaw = certSection.some((l) => EDU_HINT.test(l))
    ? certSection.filter((l) => !EDU_HINT.test(l) && (CERT_HINT.test(l) || !DATE_RANGE.test(l)))
    : certSection;
  const certifications = uniq(
    certsRaw.filter((l) => !isTag(l) && !DATE_RANGE.test(l) && l.length > 3)
  ).slice(0, 20);

  const languages = uniq(
    splitLanguages(sectionAfter(lines, /^LANGUAGES$/i)).filter((l) => !isTag(l) && l.length > 2)
  ).slice(0, 12);

  const bullets = lines.filter((l) => /^[▪•·]$/.test(l) || /^[▪•·]\s+/.test(l)).length;

  return { summary, skills, roles, certifications, languages, bullets };
}

const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9+#. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Strict phrase match: the term itself must appear, not just its words.
    Short terms ("SQL", "R") need a word boundary, or "PostgreSQL" counts. */
export function mentions(haystack: string, phrase: string): boolean {
  const hay = norm(haystack);
  const p = norm(phrase);
  if (!p) return false;
  if (p.includes(" ")) return hay.includes(p);
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#.])${esc}([^a-z0-9+#.]|$)`).test(hay);
}

/**
 * True when `phrase` is visibly present in the master resume. Exact substring
 * first, then a token overlap so a re-punctuated or re-ordered phrase still
 * counts. Used to prove that nothing was invented.
 */
export function appearsIn(haystack: string, phrase: string): boolean {
  const hay = norm(haystack);
  const p = norm(phrase);
  if (!p) return true;
  if (hay.includes(p)) return true;
  const tokens = p.split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return true;
  const hit = tokens.filter((t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(hay)).length;
  return hit / tokens.length >= 0.6;
}
