import type { Profile } from "@career-ops/contracts";

/**
 * Deterministic extraction from resume text.
 *
 * This is the part that must not hallucinate: it only returns what it can point
 * at in the text. Anything it cannot find is left absent, and the user fills it
 * in during confirmation. The AI pass (Sarvam) runs after this and may only
 * propose values with a source span — it never invents.
 */

export type Extracted<T> = {
  value: T;
  /** The exact substring the value came from, for the confirm screen. */
  evidence: string;
  /** Character offset in the source text. */
  offset: number;
};

export type Extraction = {
  fullName?: Extracted<string>;
  email?: Extracted<string>;
  phone?: Extracted<string>;
  links: {
    linkedin?: Extracted<string>;
    github?: Extracted<string>;
    portfolio?: Extracted<string>;
  };
  city?: Extracted<string>;
  skills: Extracted<string>[];
  /** Sections found, so the UI can show what was read. */
  sections: string[];
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+91[\s-]?)?(?:\(?0?\d{2,5}\)?[\s-]?)?\d{5}[\s-]?\d{5}/;
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+/i;
const URL = /https?:\/\/[^\s)]+/i;

const INDIAN_CITIES = [
  "Chennai", "Bengaluru", "Bangalore", "Hyderabad", "Mumbai", "Pune", "Delhi",
  "New Delhi", "Gurugram", "Gurgaon", "Noida", "Kolkata", "Ahmedabad", "Coimbatore",
  "Kochi", "Jaipur", "Indore", "Chandigarh", "Trivandrum", "Thiruvananthapuram",
];

const SKILL_LEXICON = [
  "product management", "roadmap", "user research", "a/b testing", "analytics",
  "sql", "python", "figma", "jira", "agile", "scrum", "kanban", "stakeholder management",
  "go-to-market", "pricing", "growth", "retention", "funnel", "api", "saas", "b2b",
  "b2c", "machine learning", "llm", "genai", "tableau", "looker", "excel",
  "product strategy", "user stories", "prd", "okrs", "kpis", "product ops",
  "market research", "competitive analysis", "unit economics", "p&l",
];

function find(re: RegExp, text: string): Extracted<string> | undefined {
  const m = re.exec(text);
  if (!m || m.index === undefined) return undefined;
  return { value: m[0].trim(), evidence: m[0].trim(), offset: m.index };
}

function firstLineName(text: string): Extracted<string> | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    // A name line: 2–4 capitalised words, no digits, no @, not a heading.
    if (/^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(line) && line.length <= 48) {
      const offset = text.indexOf(line);
      return { value: line, evidence: line, offset: offset < 0 ? 0 : offset };
    }
  }
  return undefined;
}

export function extractFromText(text: string): Extraction {
  const out: Extraction = { links: {}, skills: [], sections: [] };

  const name = firstLineName(text);
  if (name) out.fullName = name;

  const email = find(EMAIL, text);
  if (email) out.email = email;

  const phone = find(PHONE, text);
  if (phone) out.phone = phone;

  const li = find(LINKEDIN, text);
  if (li) out.links.linkedin = { ...li, value: withScheme(li.value) };

  const gh = find(GITHUB, text);
  if (gh) out.links.github = { ...gh, value: withScheme(gh.value) };

  const url = find(URL, text);
  if (url && !/linkedin|github/i.test(url.value)) out.links.portfolio = url;

  for (const city of INDIAN_CITIES) {
    const i = text.indexOf(city);
    if (i >= 0) {
      out.city = { value: city, evidence: city, offset: i };
      break;
    }
  }

  const lower = text.toLowerCase();
  for (const skill of SKILL_LEXICON) {
    const i = lower.indexOf(skill);
    if (i >= 0) out.skills.push({ value: skill, evidence: text.slice(i, i + skill.length), offset: i });
  }

  for (const heading of ["experience", "education", "skills", "projects", "summary", "certifications"]) {
    if (new RegExp(`^\\s*${heading}\\b`, "im").test(text)) out.sections.push(heading);
  }

  return out;
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Turn an extraction into a Profile draft. `confirmedAt` is deliberately left
 * unset: the draft is not usable for scoring or applications until the user
 * confirms it.
 */
export function toProfileDraft(extraction: Extraction, id: string): Profile {
  const city = extraction.city?.value ?? "";
  return {
    id,
    fullName: extraction.fullName?.value ?? "",
    ...(extraction.email ? { email: extraction.email.value } : {}),
    ...(extraction.phone ? { phone: extraction.phone.value } : {}),
    location: { city, country: "IN" },
    links: {
      ...(extraction.links.linkedin ? { linkedin: extraction.links.linkedin.value } : {}),
      ...(extraction.links.github ? { github: extraction.links.github.value } : {}),
      ...(extraction.links.portfolio ? { portfolio: extraction.links.portfolio.value } : {}),
    },
    experience: [],
    education: [],
    skills: extraction.skills.map((s) => s.value),
  };
}

/** Every field that still needs a human decision. */
export function openQuestions(profile: Profile): string[] {
  const q: string[] = [];
  if (!profile.fullName) q.push("Full name");
  if (!profile.location.city) q.push("City");
  if (profile.experience.length === 0) q.push("Work experience");
  if (profile.skills.length === 0) q.push("Skills");
  if (profile.yearsExperience === undefined) q.push("Years of experience");
  return q;
}
