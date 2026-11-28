// Keyed job APIs.
//
// These are the legal alternative to scraping LinkedIn: aggregators that
// already hold a licence to redistribute the listings. Each one needs a key
// the user signs up for, so the connector is dormant until a key is stored.
//
// Verified 2026-11-19:
//   Adzuna     GET  api.adzuna.com/v1/api/jobs/in/search/1   -> 401 AUTH_FAIL without a key
//   Jooble     POST jooble.org/api/<key>                     -> 403 Cloudflare without a key
//   Careerjet  GET  search.api.careerjet.net/v4/query        -> 401 "Invalid API key"
// All three endpoints exist and answer; none of them work without a key.

import type { Job } from "@career-ops/contracts";
import { fromFirecrawl, fromTinyfish, testFirecrawl, testTinyfish } from "./websearch";

export type SourceKeys = {
  adzunaAppId?: string;
  adzunaAppKey?: string;
  joobleKey?: string;
  careerjetKey?: string;
  careerjetDataKey?: string;
  jsearchKey?: string;
  firecrawlKey?: string;
  tinyfishKey?: string;
};

export type AggregatorResult = { jobs: Job[]; ms: number; error?: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function iso(v: unknown): string | undefined {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function clean(s: unknown): string {
  return String(s ?? "")
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

async function getJson(url: string, init?: RequestInit, ms = 20000): Promise<unknown> {
  const r = await fetch(url, {
    ...init,
    headers: { "user-agent": UA, accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(ms),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${text.slice(0, 120)}`);
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ */
/* Adzuna — India is country code "in"                                 */
/* ------------------------------------------------------------------ */

export async function fromAdzuna(
  role: string,
  city: string | undefined,
  keys: SourceKeys,
): Promise<Job[]> {
  if (!keys.adzunaAppId || !keys.adzunaAppKey) throw new Error("no key");
  const now = new Date().toISOString();
  const q = new URLSearchParams({
    app_id: keys.adzunaAppId,
    app_key: keys.adzunaAppKey,
    results_per_page: "50",
    what: role,
    /* Adzuna filters by age itself, so the 7-day rule is enforced at source. */
    max_days_old: "7",
    "content-type": "application/json",
  });
  if (city) q.set("where", city);

  const data = (await getJson(`https://api.adzuna.com/v1/api/jobs/in/search/1?${q}`)) as {
    results?: Array<Record<string, unknown>>;
  };

  return (data.results ?? []).map((r) => {
    const company = (r.company as { display_name?: string } | undefined)?.display_name ?? "Unknown";
    const loc = (r.location as { display_name?: string } | undefined)?.display_name ?? "";
    const url = String(r.redirect_url ?? "");
    return {
      id: `adzuna:${String(r.id ?? url)}`,
      sourceId: "adzuna",
      sourceUrl: url,
      applyUrl: url,
      company,
      title: String(r.title ?? "").trim(),
      location: loc,
      country: "IN",
      description: clean(r.description),
      ...(iso(r.created) ? { datePosted: iso(r.created)! } : {}),
      firstSeenAt: now,
      status: "open" as const,
      ...(r.contract_time ? { employmentType: String(r.contract_time) } : {}),
      ...((r.category as { label?: string } | undefined)?.label
        ? { department: String((r.category as { label?: string }).label) }
        : {}),
    } satisfies Job;
  }).filter((j) => j.title && j.sourceUrl);
}

/* ------------------------------------------------------------------ */
/* Jooble — key is part of the path                                    */
/* ------------------------------------------------------------------ */

export async function fromJooble(
  role: string,
  city: string | undefined,
  keys: SourceKeys,
): Promise<Job[]> {
  if (!keys.joobleKey) throw new Error("no key");
  const now = new Date().toISOString();

  const data = (await getJson(`https://jooble.org/api/${encodeURIComponent(keys.joobleKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keywords: role, location: city ?? "India", page: "1" }),
  })) as { jobs?: Array<Record<string, unknown>> };

  return (data.jobs ?? []).map((r) => {
    const url = String(r.link ?? "");
    return {
      id: `jooble:${String(r.id ?? url)}`,
      sourceId: "jooble",
      sourceUrl: url,
      applyUrl: url,
      company: String(r.company ?? "Unknown").trim() || "Unknown",
      title: String(r.title ?? "").trim(),
      location: String(r.location ?? ""),
      country: "IN",
      description: clean(r.snippet),
      ...(iso(r.updated) ? { datePosted: iso(r.updated)! } : {}),
      firstSeenAt: now,
      status: "open" as const,
      ...(r.type ? { employmentType: String(r.type) } : {}),
    } satisfies Job;
  }).filter((j) => j.title && j.sourceUrl);
}

/* ------------------------------------------------------------------ */
/* Careerjet — two products, two keys                                  */
/*                                                                     */
/*  publisher  search.api.careerjet.net/v4/query   free, needs a site  */
/*  data       data.api.careerjet.net/v1/query     commercial, $2/1k   */
/*                                                                     */
/* Both use HTTP Basic: the key is the username, the password is empty. */
/* ------------------------------------------------------------------ */

function basic(key: string): string {
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

/** "Y" -> per year. Kept as a string because we never invent a number. */
const SALARY_PERIOD: Record<string, string> = {
  Y: "year",
  M: "month",
  W: "week",
  D: "day",
  H: "hour",
};

/** 1200000 INR per year -> "₹12.0–18.0 LPA". Anything else stays literal. */
export function formatSalary(
  min: unknown,
  max: unknown,
  currency: unknown,
  type: unknown,
): string | undefined {
  const rawLo = typeof min === "number" ? min : Number(min);
  const rawHi = typeof max === "number" ? max : Number(max);
  const lo = Number.isFinite(rawLo) && rawLo > 0 ? rawLo : NaN;
  const hi = Number.isFinite(rawHi) && rawHi > 0 ? rawHi : NaN;
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return undefined;
  const cur = String(currency ?? "").toUpperCase();
  const period = SALARY_PERIOD[String(type ?? "Y").toUpperCase()] ?? "year";

  if (cur === "INR" && period === "year") {
    const l = Number.isFinite(lo) ? (lo / 100000).toFixed(1) : null;
    const h = Number.isFinite(hi) ? (hi / 100000).toFixed(1) : null;
    if (l && h) return `₹${l}–${h} LPA`;
    return `₹${l ?? h} LPA`;
  }

  const sym = cur === "INR" ? "₹" : cur === "USD" ? "$" : cur === "EUR" ? "€" : cur === "GBP" ? "£" : cur ? cur + " " : "";
  const fmt = (n: number) => (n >= 1000 ? n.toLocaleString("en-IN") : String(n));
  if (Number.isFinite(lo) && Number.isFinite(hi)) return `${sym}${fmt(lo)}–${fmt(hi)} per ${period}`;
  return `${sym}${fmt(Number.isFinite(lo) ? lo : hi)} per ${period}`;
}

export async function fromCareerjet(
  role: string,
  city: string | undefined,
  keys: SourceKeys,
): Promise<Job[]> {
  if (!keys.careerjetKey) throw new Error("no key");
  const now = new Date().toISOString();
  const q = new URLSearchParams({
    locale_code: "en_IN",
    keywords: role,
    user_ip: "127.0.0.1",
    user_agent: UA,
    page_size: "50",
  });
  if (city) q.set("location", city);

  const data = (await getJson(`https://search.api.careerjet.net/v4/query?${q}`, {
    headers: { authorization: basic(keys.careerjetKey) },
  })) as { jobs?: Array<Record<string, unknown>> };

  return (data.jobs ?? []).map((r) => {
    const url = String(r.url ?? "");
    return {
      id: `careerjet:${url}`,
      sourceId: "careerjet",
      sourceUrl: url,
      applyUrl: url,
      company: String(r.company ?? "Unknown").trim() || "Unknown",
      title: String(r.title ?? "").trim(),
      location: String(r.locations ?? ""),
      country: "IN",
      description: clean(r.description),
      ...(iso(r.date) ? { datePosted: iso(r.date)! } : {}),
      firstSeenAt: now,
      status: "open" as const,
    } satisfies Job;
  }).filter((j) => j.title && j.sourceUrl);
}

/* ------------------------------------------------------------------ */
/* Careerjet Job Data API — the commercial product                     */
/* ------------------------------------------------------------------ */

export type CareerjetDataJob = Job & { salary?: string };

export async function fromCareerjetData(
  role: string,
  city: string | undefined,
  keys: SourceKeys,
): Promise<CareerjetDataJob[]> {
  if (!keys.careerjetDataKey) throw new Error("no key");
  const now = new Date().toISOString();
  const q = new URLSearchParams({
    locale_code: "en_IN",
    keywords: role,
    page_size: "100",
    sort: "date",
  });
  if (city) q.set("location", city);

  const data = (await getJson(`https://data.api.careerjet.net/v1/query?${q}`, {
    headers: { authorization: basic(keys.careerjetDataKey) },
  })) as { type?: string; jobs?: Array<Record<string, unknown>>; message?: string };

  /* A location that matches several places returns LOCATIONS, not JOBS. */
  if (data.type && data.type !== "JOBS") {
    throw new Error(data.message || `unexpected response type ${data.type}`);
  }

  return (data.jobs ?? [])
    .map((r) => {
      const jobId = String(r.job_id ?? "");
      const title = String(r.title ?? "").trim();
      const loc = String(r.locations ?? "");
      /* The data API returns no click-through URL, so the canonical record is
         the detail endpoint. The workspace shows it as a data link. */
      const url = jobId ? `https://data.api.careerjet.net/v1/job/${jobId}` : "";
      const salary = formatSalary(r.salary_min, r.salary_max, r.salary_currency_code, r.salary_type);
      return {
        id: `careerjet-data:${jobId || url}`,
        sourceId: "careerjet-data",
        sourceUrl: url,
        applyUrl: url,
        company: String(r.company ?? "Unknown").trim() || "Unknown",
        title,
        location: loc,
        country: "IN",
        description: clean(r.description),
        ...(iso(r.date) ? { datePosted: iso(r.date)! } : {}),
        firstSeenAt: now,
        status: "open" as const,
        ...(salary ? { salary } : {}),
      } as CareerjetDataJob;
    })
    .filter((j) => j.title && j.sourceUrl);
}

/* ------------------------------------------------------------------ */
/* JSearch (RapidAPI) — free tier, 200 requests a month                */
/*                                                                     */
/* This is the only free route to LinkedIn- and Indeed-sourced Indian  */
/* postings: JSearch already holds the redistribution rights. RapidAPI */
/* issues a key on signup with no card; the free plan is a hard 200    */
/* requests a month.                                                   */
/* ------------------------------------------------------------------ */

export async function fromJSearch(
  role: string,
  city: string | undefined,
  keys: SourceKeys,
): Promise<Job[]> {
  if (!keys.jsearchKey) throw new Error("no key");
  const now = new Date().toISOString();
  const q = new URLSearchParams({
    query: city ? `${role} in ${city}, India` : `${role} in India`,
    page: "1",
    num_pages: "1",
    country: "in",
    date_posted: "week",
  });

  const data = (await getJson(`https://jsearch.p.rapidapi.com/search?${q}`, {
    headers: {
      "x-rapidapi-key": keys.jsearchKey,
      "x-rapidapi-host": "jsearch.p.rapidapi.com",
    },
  })) as { data?: Array<Record<string, unknown>>; message?: string };

  return (data.data ?? [])
    .map((r) => {
      const url = String(r.job_apply_link ?? "");
      const loc = [r.job_city, r.job_state, r.job_country].filter(Boolean).join(", ");
      const salary = formatSalary(
        r.job_min_salary,
        r.job_max_salary,
        r.job_salary_currency,
        r.job_salary_period === "YEAR" ? "Y" : r.job_salary_period === "MONTH" ? "M" : "Y",
      );
      return {
        id: `jsearch:${String(r.job_id ?? url)}`,
        sourceId: "jsearch",
        sourceUrl: url,
        applyUrl: url,
        company: String(r.employer_name ?? "Unknown").trim() || "Unknown",
        title: String(r.job_title ?? "").trim(),
        location: loc,
        country: "IN",
        description: clean(r.job_description),
        ...(iso(r.job_posted_at_datetime_utc) ? { datePosted: iso(r.job_posted_at_datetime_utc)! } : {}),
        firstSeenAt: now,
        status: "open" as const,
        ...(r.job_employment_type ? { employmentType: String(r.job_employment_type) } : {}),
        ...(r.job_is_remote === true ? { workMode: "remote" as const } : {}),
        ...(salary ? { salary } : {}),
      } satisfies Job;
    })
    .filter((j) => j.title && j.sourceUrl);
}

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

export type Aggregator = {
  id: "adzuna" | "jooble" | "careerjet" | "careerjet-data" | "jsearch" | "firecrawl" | "tinyfish";
  label: string;
  /** What the user has to paste. */
  fields: Array<{ key: keyof SourceKeys; label: string }>;
  signup: string;
  free: string;
  /** True when the service stops being free after a trial or charges per call. */
  paid?: boolean;
  run: (role: string, city: string | undefined, keys: SourceKeys) => Promise<Job[]>;
  hasKey: (keys: SourceKeys) => boolean;
  /** A cheap call that proves the key works; returns one line for the user. */
  test?: (keys: SourceKeys) => Promise<string>;
  /** Shown above the key box: what this source adds. */
  blurb?: string;
};

export const AGGREGATORS: Aggregator[] = [
  {
    id: "firecrawl",
    label: "Firecrawl — Fortune 500 career sites",
    fields: [{ key: "firecrawlKey", label: "API key (fc-...)" }],
    signup: "https://www.firecrawl.dev/app/api-keys",
    free: "Free plan: 1,000 credits a month, no card",
    blurb: "Searches Workday, SuccessFactors, Oracle, Taleo, iCIMS, Eightfold and Phenom pages — where most Fortune 500 India roles live.",
    run: fromFirecrawl,
    hasKey: (k) => Boolean(k.firecrawlKey),
    test: testFirecrawl,
  },
  {
    id: "tinyfish",
    label: "TinyFish — career-site search",
    fields: [{ key: "tinyfishKey", label: "API key" }],
    signup: "https://agent.tinyfish.ai/api-keys",
    free: "Search is free within a daily allowance",
    blurb: "Same career-site coverage through TinyFish's search index. Use either one, or both.",
    run: fromTinyfish,
    hasKey: (k) => Boolean(k.tinyfishKey),
    test: testTinyfish,
  },
  {
    id: "adzuna",
    label: "Adzuna",
    fields: [
      { key: "adzunaAppId", label: "App ID" },
      { key: "adzunaAppKey", label: "App key" },
    ],
    signup: "https://developer.adzuna.com/signup",
    free: "25 free calls, then £8/month — paid, not used",
    paid: true,
    run: fromAdzuna,
    hasKey: (k) => Boolean(k.adzunaAppId && k.adzunaAppKey),
  },
  {
    id: "jooble",
    label: "Jooble",
    fields: [{ key: "joobleKey", label: "API key" }],
    signup: "https://jooble.org/api/about",
    free: "Free key on request, no card",
    run: fromJooble,
    hasKey: (k) => Boolean(k.joobleKey),
  },
  {
    id: "careerjet-data",
    label: "Careerjet Job Data API",
    fields: [{ key: "careerjetDataKey", label: "API key" }],
    signup: "https://www.careerjet.com/recruiter/jobs-data-api",
    free: "$2 per 1,000 calls — paid, not used",
    paid: true,
    run: fromCareerjetData as Aggregator["run"],
    hasKey: (k) => Boolean(k.careerjetDataKey),
  },
  {
    id: "careerjet",
    label: "Careerjet (publisher)",
    fields: [{ key: "careerjetKey", label: "Publisher key" }],
    signup: "https://www.careerjet.co.in/partners",
    free: "Free publisher key, approval required",
    run: fromCareerjet,
    hasKey: (k) => Boolean(k.careerjetKey),
  },
  {
    id: "jsearch",
    label: "JSearch (RapidAPI)",
    fields: [{ key: "jsearchKey", label: "RapidAPI key" }],
    signup: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
    free: "200 requests/month free, no card — covers LinkedIn and Indeed",
    run: fromJSearch,
    hasKey: (k) => Boolean(k.jsearchKey),
  },
];

export async function runAggregator(
  a: Aggregator,
  role: string,
  city: string | undefined,
  keys: SourceKeys,
): Promise<AggregatorResult> {
  const t0 = Date.now();
  if (!a.hasKey(keys)) return { jobs: [], ms: 0, error: "no key" };
  try {
    const jobs = await a.run(role, city, keys);
    return { jobs, ms: Date.now() - t0 };
  } catch (e) {
    return { jobs: [], ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

export const AGGREGATORS_POLICY = {
  id: "aggregators",
  name: "Keyed sources (Firecrawl, TinyFish, Adzuna, Jooble, Careerjet, JSearch)",
  tier: 1 as const,
  discovery: "api" as const,
  submission: "user-directed" as const,
  auth: ["sso"] as const,
  notes: "Runs only when the user stores their own free/publisher API key; links hand off to employer postings.",
};
