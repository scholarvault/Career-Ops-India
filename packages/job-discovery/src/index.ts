import type { Job, SourcePolicy } from "@career-ops/contracts";

/**
 * Lever's public postings API. No key, no login, no scraping.
 * `createdAt` is the employer's posting date — we keep it separate from
 * `firstSeenAt`, which is when *we* found it.
 */

export const LEVER_POLICY: SourcePolicy = {
  id: "lever",
  name: "Lever",
  tier: 1,
  discovery: "api",
  submission: "user-directed",
  auth: [],
  robotsReviewedAt: "2026-11-19",
  termsReviewedAt: "2026-11-19",
  notes:
    "Public postings API. Application submission needs an employer-side API key, so the agent fills the public form and the user submits.",
};

type LeverPosting = {
  id: string;
  text: string;
  categories?: {
    location?: string;
    team?: string;
    department?: string;
    commitment?: string;
    allLocations?: string[];
  };
  createdAt?: number;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  description?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
};

export type LeverOptions = {
  /** Company slug as it appears in jobs.lever.co/<slug>. */
  company: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
  /** Clock override for deterministic tests. */
  now?: () => Date;
};

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferWorkMode(text: string): Job["workMode"] {
  const t = text.toLowerCase();
  if (/\bremote\b|work from home|wfh/.test(t)) return "remote";
  if (/\bhybrid\b/.test(t)) return "hybrid";
  if (/\bon-?site\b|in-?office|from office/.test(t)) return "office";
  return undefined;
}

export function normaliseLeverPosting(
  company: string,
  p: LeverPosting,
  now: Date,
): Job {
  const lists = (p.lists ?? [])
    .map((l) => `## ${l.text ?? ""}\n${stripHtml(l.content ?? "")}`)
    .join("\n\n");

  const description = [
    p.descriptionPlain ? stripHtml(p.descriptionPlain) : stripHtml(p.description ?? ""),
    lists,
    p.additionalPlain ? stripHtml(p.additionalPlain) : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const location = p.categories?.location ?? p.categories?.allLocations?.[0] ?? "";

  return {
    id: `lever:${company}:${p.id}`,
    sourceId: "lever",
    sourceUrl: p.hostedUrl ?? `https://jobs.lever.co/${company}/${p.id}`,
    ...(p.applyUrl ? { applyUrl: p.applyUrl } : {}),
    company,
    title: p.text,
    location,
    country: "IN",
    ...(inferWorkMode(`${location} ${description}`) ? { workMode: inferWorkMode(`${location} ${description}`) } : {}),
    description,
    ...(p.createdAt ? { datePosted: new Date(p.createdAt).toISOString() } : {}),
    firstSeenAt: now.toISOString(),
    status: "open",
    ...(p.categories?.commitment ? { employmentType: p.categories.commitment } : {}),
    ...(p.categories?.department ? { department: p.categories.department } : {}),
  };
}

export async function discoverLever(opts: LeverOptions): Promise<Job[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now?.() ?? new Date();
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(opts.company)}?mode=json`;

  const res = await fetchImpl(url, {
    headers: { accept: "application/json", "user-agent": "career-ops-india/0.1" },
  });
  if (!res.ok) throw new Error(`Lever ${opts.company}: HTTP ${res.status}`);

  const postings = (await res.json()) as LeverPosting[];
  if (!Array.isArray(postings)) throw new Error(`Lever ${opts.company}: unexpected payload`);

  return postings.map((p) => normaliseLeverPosting(opts.company, p, now));
}

/** Filter by city without losing the original record. */
export function inCity(jobs: Job[], city: string): Job[] {
  const c = city.toLowerCase();
  return jobs.filter(
    (j) => j.location.toLowerCase().includes(c) || j.workMode === "remote",
  );
}
