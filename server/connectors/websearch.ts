// Web search over employer career sites: Firecrawl and TinyFish.
//
// The ATS feeds in discovery.ts cover companies that publish a public JSON
// board. Most Fortune 500 employers do not: their India roles sit on Workday,
// SuccessFactors, Oracle, Taleo, iCIMS, Eightfold or Phenom pages that block a
// plain HTTP call. A search API that has already indexed those pages is the
// legal way to reach them. Each provider needs a key the user creates in
// their own browser; the key lives in data/secrets.json.
//
// Verified against the docs 2026-11-28:
//   Firecrawl  POST https://api.firecrawl.dev/v2/search   Bearer fc-...
//              GET  https://api.firecrawl.dev/v2/team/credit-usage
//              Free plan: 1,000 credits a month, no card; 2 credits per 10 results.
//   TinyFish   GET  https://api.search.tinyfish.ai/        X-API-Key
//              Search is free within a daily allowance.
//
// Nothing is invented: a result is kept only when its URL is a single posting
// and its title or snippet names a place in India. There is no datePosted,
// because a search index does not know when the employer posted it.

import type { Job } from "@career-ops/contracts";
import type { SourceKeys } from "./aggregators";

/* Career sites and ATS hosts. Workday through Phenom carry most Fortune 500
   India hiring; the rest catch the large tech employers' own sites. */
export const CAREER_HOSTS = [
  "myworkdayjobs.com",
  "successfactors.com",
  "successfactors.eu",
  "oraclecloud.com",
  "taleo.net",
  "icims.com",
  "eightfold.ai",
  "phenompeople.com",
  "smartrecruiters.com",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "amazon.jobs",
  "careers.microsoft.com",
  "careers.google.com",
];

/* Indian job boards, reached only through the search index: the title,
   snippet and link the engine already holds. The app does not open or crawl
   these pages to find jobs; applying opens the posting for the user (ADR-031).
   Each one shows under its own name in Find's source filter. */
export const BOARDS: Array<{ host: string; id: string; name: string }> = [
  { host: "foundit.in", id: "foundit", name: "foundit" },
  { host: "shine.com", id: "shine", name: "Shine" },
  { host: "timesjobs.com", id: "timesjobs", name: "TimesJobs" },
  { host: "instahyre.com", id: "instahyre", name: "Instahyre" },
  { host: "cutshort.io", id: "cutshort", name: "Cutshort" },
  { host: "hirist.tech", id: "hirist", name: "Hirist" },
  { host: "iimjobs.com", id: "iimjobs", name: "iimjobs" },
  { host: "internshala.com", id: "internshala", name: "Internshala" },
  { host: "apna.co", id: "apna", name: "Apna" },
  { host: "wellfound.com", id: "wellfound", name: "Wellfound" },
  { host: "freshersworld.com", id: "freshersworld", name: "Freshersworld" },
];
export const BOARD_HOSTS = BOARDS.map((b) => b.host);
const boardOf = (host: string) => BOARDS.find((b) => host === b.host || host.endsWith(`.${b.host}`));

/* "1,240 Product Manager jobs in Chennai" is a listing page, not a posting */
const LISTING_TITLE = /\b\d[\d,]*\+?\s+(\w+\s+){0,4}(jobs|vacancies|openings)\b|\bjobs\s+(in|for|at)\s+\w|\b(latest|top|best)\s+\w*\s*jobs\b|job openings\b/i;

/** On a board, the employer is in the title or snippet ("... at Acme"), or it is not stated. */
function boardCompany(title: string, snippet: string): string {
  /* a city, a board's name or a bracketed note is never the employer
     (Shine titles read "Product Manager - Chennai - ...") */
  const ok = (c: string) =>
    Boolean(c) &&
    !/^(foundit|shine|timesjobs|instahyre|cutshort|hirist|iimjobs|internshala|apna|wellfound|freshersworld)$/i.test(c) &&
    !placeIn(c) && !/[()]/.test(c) && !/\b(jobs?|vacanc(y|ies)|hiring|years?|lpa)\b/i.test(c);
  for (const t of [title, snippet]) {
    const at = t.match(/\bat\s+([A-Z][\w&.()' -]{1,48}?)(?=\s*(?:[-|–·,]|\bin\b|\(|$))/);
    if (at?.[1] && ok(at[1].trim())) return at[1].trim();
  }
  const parts = title.split(/\s+[-|–]\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 3 && !boardOf(parts[1]!.toLowerCase()) && ok(parts[1]!)) return parts[1]!;
  return "";
}

const PLACES: Array<[RegExp, string]> = [
  [/\bchennai\b|\bmadras\b/i, "Chennai, Tamil Nadu, India"],
  [/\bbengaluru\b|\bbangalore\b/i, "Bengaluru, Karnataka, India"],
  [/\bhyderabad\b/i, "Hyderabad, Telangana, India"],
  [/\bpune\b/i, "Pune, Maharashtra, India"],
  [/\bmumbai\b|\bnavi mumbai\b/i, "Mumbai, Maharashtra, India"],
  [/\bgurugram\b|\bgurgaon\b/i, "Gurugram, Haryana, India"],
  [/\bnoida\b/i, "Noida, Uttar Pradesh, India"],
  [/\bnew delhi\b|\bdelhi\b/i, "Delhi, India"],
  [/\bkolkata\b/i, "Kolkata, West Bengal, India"],
  [/\bahmedabad\b/i, "Ahmedabad, Gujarat, India"],
  [/\bcoimbatore\b/i, "Coimbatore, Tamil Nadu, India"],
  [/\bkochi\b|\bcochin\b|\btrivandrum\b|\bthiruvananthapuram\b/i, "Kerala, India"],
  [/\bremote\b[^.]{0,30}\bindia\b|\bindia\b[^.]{0,30}\bremote\b/i, "Remote, India"],
  [/\bindia\b/i, "India"],
];

function placeIn(text: string): string {
  for (const [rx, label] of PLACES) if (rx.test(text)) return label;
  return "";
}

/* A search result for a listing page ("All jobs", "Search results") is not a
   posting. A posting URL carries an id or a /job/ style segment. */
function looksLikePosting(u: URL): boolean {
  const p = u.pathname.toLowerCase();
  if (/\/(search|jobs\/?$|careers\/?$|job-search|results)/.test(p) && !/\d{4,}/.test(p)) return false;
  return /\/(job|jobs|posting|postings|position|requisition|details|vacancy|o)\/[^/]+/.test(p) || /\d{5,}|[0-9a-f]{8}-[0-9a-f]{4}/.test(p + u.search);
}

const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** The employer, read from the URL's own structure, never from a guess. */
function companyFrom(u: URL, title: string): string {
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split("/").filter(Boolean);
  const wd = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (wd?.[1]) return titleCase(wd[1]);
  const first = seg[0];
  if (/greenhouse\.io$|lever\.co$|ashbyhq\.com$|smartrecruiters\.com$/.test(host) && first) return titleCase(first);
  if (host.endsWith("amazon.jobs")) return "Amazon";
  if (host.endsWith("careers.microsoft.com")) return "Microsoft";
  if (host.endsWith("careers.google.com")) return "Google";
  const fromTitle = title.match(/\bat\s+([A-Z][\w&.\- ]{1,40})$/);
  if (fromTitle?.[1]) return fromTitle[1].trim();
  const label = host.replace(/^(www|careers|jobs|career)\./, "").split(".")[0];
  return titleCase(label || host);
}

function cleanTitle(raw: string): string {
  const first = raw.split(/\s+[|·]\s+/)[0] ?? raw;
  return first
    .replace(/\s*-\s*(myworkdayjobs\.com|careers?|jobs?|workday|job details?)\b.*$/i, "")
    .replace(/^job (details|application)( for)?:?\s*/i, "")
    .replace(/\s+at\s+[A-Z][\w&.\- ]{1,40}$/, "")
    .trim();
}

export function toJob(source: "firecrawl" | "tinyfish", url: string, title: string, snippet: string, now: string): Job | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const board = boardOf(host);
  if (!board && !CAREER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (!looksLikePosting(u)) return null;
  if (board && LISTING_TITLE.test(title || "")) return null;
  const t = cleanTitle(title || "").replace(new RegExp(`\\s*[-|–]\\s*${board ? board.name : "\\b\\B"}\\b.*$`, "i"), "");
  /* a board title carries the employer and city too: keep the role alone */
  const role = board ? (t.split(/\s+[-–|]\s+/)[0] ?? t).replace(/\s+jobs?\s+(in|at)\s+.*$/i, "").replace(/\s+(role|opening|job|vacancy)\s*$/i, "").replace(/^\d+\s*[-–]\s*\d+\s*(years?|yrs)\s+/i, "").trim() : t;
  if (!role || role.length > 140) return null;
  const location = placeIn(`${title} ${snippet} ${u.pathname.replace(/[-_/]/g, " ")}`);
  if (!location) return null;
  const company = board ? boardCompany(title || "", snippet || "") : companyFrom(u, title);
  if (!company) return null; // a posting with no employer named is not worth a resume
  return {
    id: `${board ? board.id : source}:${u.origin}${u.pathname}`,
    sourceId: board ? board.id : source,
    sourceUrl: url,
    applyUrl: url,
    company,
    title: role,
    location,
    country: "IN",
    ...(/\bremote\b/i.test(location) ? { workMode: "remote" as const } : {}),
    description: snippet.trim(),
    firstSeenAt: now,
    status: "unknown" as const,
  } as Job;
}

function dedupe(jobs: Array<Job | null>): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const j of jobs) {
    if (!j || seen.has(j.id)) continue;
    seen.add(j.id);
    out.push(j);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Firecrawl                                                           */
/* ------------------------------------------------------------------ */

async function firecrawlCall(path: string, key: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`https://api.firecrawl.dev/v2${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(45000),
  });
  const body = (await r.json().catch(() => ({}))) as any;
  if (r.status === 401) throw new Error("Firecrawl did not accept that key.");
  if (r.status === 402) throw new Error("Firecrawl credits are used up for this month.");
  if (r.status === 429) throw new Error("Firecrawl rate limit; try again in a minute.");
  if (!r.ok || body.success === false) throw new Error(`Firecrawl ${r.status}: ${String(body.error ?? "").slice(0, 120)}`);
  return body;
}

export async function fromFirecrawl(role: string, city: string | undefined, keys: SourceKeys): Promise<Job[]> {
  if (!keys.firecrawlKey) throw new Error("no key");
  const now = new Date().toISOString();
  const where = `${city || ""} India`.trim();
  /* Three angles, about 12 credits in all. Measured 2026-11-28: the
     domain-filtered query alone found Trimble and Capco; naming Workday found
     Elsevier and KONE. A date or location filter returned nothing, so neither
     is sent; the apply step re-reads the posting before it fills anything. */
  const queries = [
    { query: `"${role}" ${where}`, limit: 20, country: "IN", includeDomains: CAREER_HOSTS },
    { query: `${role} ${where} myworkdayjobs`, limit: 20, country: "IN" },
    { query: `${role} ${where} careers successfactors OR oraclecloud OR eightfold OR icims`, limit: 20, country: "IN" },
    /* Indian boards, from the index only (ADR-031): about 4 more credits */
    { query: `"${role}" ${where} job`, limit: 20, country: "IN", includeDomains: BOARD_HOSTS },
  ];
  const settled = await Promise.allSettled(
    queries.map((q) => firecrawlCall("/search", keys.firecrawlKey!, { method: "POST", body: JSON.stringify(q) })),
  );
  const ok = settled.filter((s): s is PromiseFulfilledResult<any> => s.status === "fulfilled");
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;
  const rows: any[] = ok.flatMap((s) => s.value?.data?.web ?? []);
  return dedupe(rows.map((r) => toJob("firecrawl", String(r.url ?? ""), String(r.title ?? ""), String(r.description ?? ""), now)));
}

export async function testFirecrawl(keys: SourceKeys): Promise<string> {
  if (!keys.firecrawlKey) throw new Error("No Firecrawl key stored.");
  const body = await firecrawlCall("/team/credit-usage", keys.firecrawlKey);
  const left = Number(body?.data?.remainingCredits);
  return Number.isFinite(left) ? `Connected. ${left.toLocaleString("en-IN")} credits left this month.` : "Connected.";
}

/* ------------------------------------------------------------------ */
/* TinyFish                                                            */
/* ------------------------------------------------------------------ */

async function tinyfishSearch(key: string, params: Record<string, string>): Promise<any> {
  const r = await fetch(`https://api.search.tinyfish.ai/?${new URLSearchParams(params)}`, {
    headers: { "X-API-Key": key, accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const body = (await r.json().catch(() => ({}))) as any;
  const code = String(body?.error?.code ?? "");
  if (r.status === 401) throw new Error("TinyFish did not accept that key.");
  if (r.status === 402) throw new Error("TinyFish free search allowance is used up for today.");
  if (r.status === 429) throw new Error(`TinyFish limit reached${code ? ` (${code})` : ""}.`);
  if (!r.ok) throw new Error(`TinyFish ${r.status}: ${String(body?.error?.message ?? "").slice(0, 120)}`);
  return body;
}

export async function fromTinyfish(role: string, city: string | undefined, keys: SourceKeys): Promise<Job[]> {
  if (!keys.tinyfishKey) throw new Error("no key");
  const now = new Date().toISOString();
  const after = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const base = {
    query: `${role} job ${city || ""} India`.replace(/\s+/g, " ").trim(),
    purpose: "Find open job postings on employer career sites in India",
    location: "IN",
    language: "en",
    include_domains: CAREER_HOSTS.join(","),
    after_date: after,
  };
  /* No result-count parameter; two pages of career sites, one of Indian boards (ADR-031). */
  const boards = { ...base, purpose: "Find single job postings on Indian job boards", include_domains: BOARD_HOSTS.join(",") };
  const pages = await Promise.all([
    ...[0, 1].map((page) => tinyfishSearch(keys.tinyfishKey!, { ...base, page: String(page) }).catch(() => null)),
    tinyfishSearch(keys.tinyfishKey!, { ...boards, page: "0" }).catch(() => null),
  ]);
  const rows: any[] = pages.flatMap((p) => p?.results ?? []);
  if (!rows.length && pages.every((p) => p === null)) {
    await tinyfishSearch(keys.tinyfishKey, base);
  }
  return dedupe(rows.map((r) => toJob("tinyfish", String(r.url ?? ""), String(r.title ?? ""), String(r.snippet ?? ""), now)));
}

export async function testTinyfish(keys: SourceKeys): Promise<string> {
  if (!keys.tinyfishKey) throw new Error("No TinyFish key stored.");
  const body = await tinyfishSearch(keys.tinyfishKey, { query: "careers India", location: "IN" });
  return `Connected. A test search returned ${Number(body?.total_results ?? (body?.results ?? []).length)} results.`;
}

export const WEBSEARCH_POLICY = {
  id: "websearch",
  name: "Career-site search (Firecrawl, TinyFish)",
  tier: 1 as const,
  discovery: "api" as const,
  submission: "user-directed" as const,
  auth: ["sso"] as const,
  notes:
    "Searches employer career sites, ATS hosts and Indian job boards (foundit, Shine, TimesJobs, Instahyre, Cutshort, Hirist, iimjobs, Internshala, Apna, Wellfound, Freshersworld) through the user's own Firecrawl or TinyFish key. Uses only what the search index returns (title, snippet, link); never opens or crawls a board page to discover. Keeps only single-posting URLs that name a place in India and an employer; never sets datePosted.",
};

/* ------------------------------------------------------------------ */
/* the user's own web search (Find → Search the web)                   */
/* ------------------------------------------------------------------ */

export type WebSearchWhere = "careers" | "boards" | "all" | string;

/** The hosts a search is limited to: employer career sites, the Indian
    boards, both, or one board by its host (foundit.in). */
export function hostsFor(where: WebSearchWhere): string[] {
  if (where === "careers") return CAREER_HOSTS;
  if (where === "boards") return BOARD_HOSTS;
  if (where === "all") return [...CAREER_HOSTS, ...BOARD_HOSTS];
  const one = BOARDS.find((b) => b.host === where || b.id === where);
  return one ? [one.host] : CAREER_HOSTS.includes(where) ? [where] : [...CAREER_HOSTS, ...BOARD_HOSTS];
}

/**
 * Search the web index for single postings, with the user's words. Kept only
 * when the link is one posting, names a place in India and an employer, the
 * same rules as Live. `days` asks the engine for pages it saw lately; it is
 * not a posting date, so datePosted stays unset.
 */
export async function webSearch(
  opts: { query: string; where: WebSearchWhere; engine: "firecrawl" | "tinyfish" | "both"; days?: number; limit?: number; city?: string },
  keys: SourceKeys,
): Promise<{ jobs: Job[]; ran: Array<{ id: string; ok: boolean; count: number; error?: string }> }> {
  const now = new Date().toISOString();
  const hosts = hostsFor(opts.where);
  /* no place in the words: the engines return pages from anywhere and every
     one is then dropped for not naming India, so the city (or India) is added */
  const words = String(opts.query || "").replace(/\s+/g, " ").trim();
  const q = (placeIn(words) ? words : `${words} ${opts.city || "India"}`).slice(0, 200);
  const limit = Math.min(Math.max(opts.limit ?? 20, 5), 40);
  const ran: Array<{ id: string; ok: boolean; count: number; error?: string }> = [];
  const out: Array<Job | null> = [];
  const wantFc = (opts.engine === "firecrawl" || opts.engine === "both") && keys.firecrawlKey;
  const wantTf = (opts.engine === "tinyfish" || opts.engine === "both") && keys.tinyfishKey;
  await Promise.all([
    wantFc
      ? (async () => {
          try {
            const tbs = opts.days && opts.days <= 1 ? "qdr:d" : opts.days && opts.days <= 7 ? "qdr:w" : opts.days && opts.days <= 31 ? "qdr:m" : undefined;
            const body = await firecrawlCall("/search", keys.firecrawlKey!, {
              method: "POST",
              body: JSON.stringify({ query: q, limit, country: "IN", includeDomains: hosts, ...(tbs ? { tbs } : {}) }),
            });
            const rows: any[] = body?.data?.web ?? [];
            const jobs = rows.map((r) => toJob("firecrawl", String(r.url ?? ""), String(r.title ?? ""), String(r.description ?? ""), now));
            out.push(...jobs);
            ran.push({ id: "firecrawl", ok: true, count: jobs.filter(Boolean).length });
          } catch (e) {
            ran.push({ id: "firecrawl", ok: false, count: 0, error: e instanceof Error ? e.message : String(e) });
          }
        })()
      : Promise.resolve(),
    wantTf
      ? (async () => {
          try {
            const params: Record<string, string> = { query: q, location: "IN", language: "en", include_domains: hosts.join(","), page: "0" };
            if (opts.days) params.after_date = new Date(Date.now() - opts.days * 86_400_000).toISOString().slice(0, 10);
            const body = await tinyfishSearch(keys.tinyfishKey!, params);
            const rows: any[] = body?.results ?? [];
            const jobs = rows.map((r) => toJob("tinyfish", String(r.url ?? ""), String(r.title ?? ""), String(r.snippet ?? ""), now));
            out.push(...jobs);
            ran.push({ id: "tinyfish", ok: true, count: jobs.filter(Boolean).length });
          } catch (e) {
            ran.push({ id: "tinyfish", ok: false, count: 0, error: e instanceof Error ? e.message : String(e) });
          }
        })()
      : Promise.resolve(),
  ]);
  if (!wantFc && !wantTf) ran.push({ id: opts.engine, ok: false, count: 0, error: "No key stored. Connect Firecrawl or TinyFish in Settings." });
  return { jobs: dedupe(out), ran };
}
