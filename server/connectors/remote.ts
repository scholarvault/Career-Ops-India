// Free remote-job APIs. No key, no signup, no card.
//
// These five boards publish an open JSON endpoint and are the only job
// sources in this project that work the moment the repo is cloned. They
// cover remote roles that hire from India, which is the segment a user
// with "remote" in their preferences actually wants.
//
// Verified 2026-11-19:
//   Himalayas       GET himalayas.app/jobs/api?limit=100         200, 20 jobs
//   Remotive        GET remotive.com/api/remote-jobs             200, 15 jobs
//   RemoteOK        GET remoteok.com/api                         200, 97 jobs
//   Jobicy          GET jobicy.com/api/v2/remote-jobs            200, 50 jobs
//   Working Nomads  GET workingnomads.com/api/exposed_jobs/      200, 37 jobs
//
// Every one of them is free and needs no account. None of them is an
// Indian job board: they are global remote boards, so each posting is
// kept only when its location allows India, APAC, or "worldwide".

import type { Job } from "@career-ops/contracts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** A location string that permits an Indian applicant. */
const OPEN_TO_INDIA = /india|worldwide|anywhere|global|apac|asia|asia[- ]pacific|remote$/i;

/** A location string that names somewhere else and does not mention India. */
const CLOSED =
  /united states|\busa\b|\bu\.?s\.?\b|canada|united kingdom|\buk\b|europe|germany|france|spain|poland|brazil|mexico|latam|japan|australia|singapore|dubai|uae|africa|nigeria|kenya/i;

function openToIndia(loc: string): boolean {
  if (/india/i.test(loc)) return true;
  if (CLOSED.test(loc)) return false;
  return OPEN_TO_INDIA.test(loc);
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

function iso(v: unknown): string | undefined {
  if (!v) return undefined;
  /* Himalayas sends Unix seconds (1795109930); new Date("1795109930") is
     Invalid Date, which silently dropped every Himalayas posting date. */
  const n = typeof v === "number" ? v : /^\d{9,13}$/.test(String(v)) ? Number(v) : NaN;
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function money(min: unknown, max: unknown, currency: unknown): string | undefined {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return undefined;
  const cur = String(currency ?? "USD").toUpperCase();
  const sym = cur === "USD" ? "$" : cur === "INR" ? "\u20b9" : cur === "EUR" ? "\u20ac" : cur === "GBP" ? "\u00a3" : cur + " ";
  const fmt = (n: number) => (n >= 1000 ? Math.round(n).toLocaleString("en-IN") : String(Math.round(n)));
  if (Number.isFinite(lo) && Number.isFinite(hi)) return `${sym}${fmt(lo)}\u2013${fmt(hi)}`;
  return `${sym}${fmt(Number.isFinite(lo) ? lo : hi)}`;
}

async function getJson(url: string, ms = 20000): Promise<unknown> {
  const r = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Loose title filter so a 100-posting board does not bury the role. */
function titleLooksLike(title: string, role: string): boolean {
  if (!role) return true;
  const words = role.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!words.length) return true;
  const t = title.toLowerCase();
  return words.some((w) => t.includes(w));
}

function base(sourceId: string, now: string) {
  return {
    sourceId,
    country: "IN" as const,
    firstSeenAt: now,
    status: "open" as const,
    workMode: "remote" as const,
  };
}

/** "Remote" + "Remote" reads badly; keep one prefix. */
function remoteLoc(loc: string): string {
  const l = loc.trim() || "Worldwide";
  return /^remote\b/i.test(l) ? l : `Remote \u00b7 ${l}`;
}

/* ------------------------------------------------------------------ */

async function fromHimalayas(role: string): Promise<Job[]> {
  const now = new Date().toISOString();
  /* The plain feed is the 20 newest jobs worldwide, which most days holds no
     India-eligible posting. The search endpoint filters country and role on
     the server: "product manager" + IN returned ~270 rows on 2026-11-27.
     An empty locationRestrictions list means worldwide. */
  const q = new URLSearchParams({ country: "IN", limit: "50" });
  if (role) q.set("q", role);
  const data = (await getJson(`https://himalayas.app/jobs/api/search?${q}`)) as {
    jobs?: Array<Record<string, unknown>>;
  };
  const nowMs = Date.now();
  return (data.jobs ?? [])
    /* Himalayas says when a posting expires; an expired one is closed. */
    .filter((r) => {
      const exp = iso(r.expiryDate);
      return !exp || Date.parse(exp) > nowMs;
    })
    .map((r) => {
      const loc = ((r.locationRestrictions as string[] | undefined) ?? []).join(", ") || "Worldwide";
      const url = String(r.applicationLink ?? r.guid ?? "");
      const salary = money(r.minSalary, r.maxSalary, r.currency);
      return {
        ...base("himalayas", now),
        id: `himalayas:${String(r.guid ?? url)}`,
        sourceUrl: url,
        applyUrl: url,
        company: String(r.companyName ?? "Unknown").trim() || "Unknown",
        title: String(r.title ?? "").trim(),
        location: remoteLoc(loc),
        description: clean(r.description ?? r.excerpt),
        ...(iso(r.pubDate) ? { datePosted: iso(r.pubDate)! } : {}),
        ...(r.employmentType ? { employmentType: String(r.employmentType) } : {}),
        ...(salary ? { salary } : {}),
      } as Job;
    })
    .filter((j) => j.title && j.sourceUrl && openToIndia(j.location) && titleLooksLike(j.title, role));
}

async function fromRemotive(role: string): Promise<Job[]> {
  const now = new Date().toISOString();
  const q = new URLSearchParams({ limit: "100" });
  if (role) q.set("search", role);
  const data = (await getJson(`https://remotive.com/api/remote-jobs?${q}`)) as {
    jobs?: Array<Record<string, unknown>>;
  };
  return (data.jobs ?? [])
    .map((r) => {
      const loc = String(r.candidate_required_location ?? "Worldwide");
      const url = String(r.url ?? "");
      return {
        ...base("remotive", now),
        id: `remotive:${String(r.id ?? url)}`,
        sourceUrl: url,
        applyUrl: url,
        company: String(r.company_name ?? "Unknown").trim() || "Unknown",
        title: String(r.title ?? "").trim(),
        location: remoteLoc(loc),
        description: clean(r.description),
        ...(iso(r.publication_date) ? { datePosted: iso(r.publication_date)! } : {}),
        ...(r.job_type ? { employmentType: String(r.job_type) } : {}),
        ...(r.salary ? { salary: String(r.salary) } : {}),
      } as Job;
    })
    .filter((j) => j.title && j.sourceUrl && openToIndia(j.location) && titleLooksLike(j.title, role));
}

async function fromRemoteOK(role: string): Promise<Job[]> {
  const now = new Date().toISOString();
  const rows = (await getJson("https://remoteok.com/api")) as Array<Record<string, unknown>>;
  return rows
    .filter((r) => r.id)
    .map((r) => {
      const loc = String(r.location ?? "Worldwide");
      const url = String(r.url ?? "");
      const salary = money(r.salary_min, r.salary_max, "USD");
      return {
        ...base("remoteok", now),
        id: `remoteok:${String(r.id ?? url)}`,
        sourceUrl: url,
        applyUrl: String(r.apply_url ?? url),
        company: String(r.company ?? "Unknown").trim() || "Unknown",
        title: String(r.position ?? "").trim(),
        location: remoteLoc(loc),
        description: clean(r.description),
        ...(iso(r.date) ? { datePosted: iso(r.date)! } : {}),
        ...(salary ? { salary } : {}),
      } as Job;
    })
    .filter((j) => j.title && j.sourceUrl && openToIndia(j.location) && titleLooksLike(j.title, role));
}

async function fromJobicy(role: string): Promise<Job[]> {
  const now = new Date().toISOString();
  /* The default feed is mostly USA-only. geo=anywhere returns the roles open
     worldwide, which are the ones an applicant in India can take. */
  const q = new URLSearchParams({ count: "50", geo: "anywhere" });
  if (role) q.set("tag", role);
  const data = (await getJson(`https://jobicy.com/api/v2/remote-jobs?${q}`)) as {
    jobs?: Array<Record<string, unknown>>;
  };
  return (data.jobs ?? [])
    .map((r) => {
      const loc = String(r.jobGeo ?? "Worldwide");
      const url = String(r.url ?? "");
      return {
        ...base("jobicy", now),
        id: `jobicy:${String(r.id ?? url)}`,
        sourceUrl: url,
        applyUrl: url,
        company: String(r.companyName ?? "Unknown").trim() || "Unknown",
        title: String(r.jobTitle ?? "").trim(),
        location: remoteLoc(loc),
        description: clean(r.jobDescription ?? r.jobExcerpt),
        ...(iso(r.pubDate) ? { datePosted: iso(r.pubDate)! } : {}),
        ...(r.jobType ? { employmentType: String(r.jobType) } : {}),
      } as Job;
    })
    .filter((j) => j.title && j.sourceUrl && openToIndia(j.location) && titleLooksLike(j.title, role));
}

async function fromWorkingNomads(role: string): Promise<Job[]> {
  const now = new Date().toISOString();
  const rows = (await getJson("https://www.workingnomads.com/api/exposed_jobs/")) as Array<
    Record<string, unknown>
  >;
  return rows
    .map((r) => {
      const loc = String(r.location ?? "Worldwide");
      const url = String(r.url ?? "");
      return {
        ...base("workingnomads", now),
        id: `workingnomads:${url}`,
        sourceUrl: url,
        applyUrl: url,
        company: String(r.company_name ?? "Unknown").trim() || "Unknown",
        title: String(r.title ?? "").trim(),
        location: remoteLoc(loc),
        description: clean(r.description),
        ...(iso(r.pub_date) ? { datePosted: iso(r.pub_date)! } : {}),
      } as Job;
    })
    .filter((j) => j.title && j.sourceUrl && openToIndia(j.location) && titleLooksLike(j.title, role));
}

/* ------------------------------------------------------------------ */

export type RemoteSource = {
  id: string;
  label: string;
  /** Always "free" — kept explicit so the UI cannot imply a key is needed. */
  cost: "free";
  signup: string;
  run: (role: string) => Promise<Job[]>;
};

export const REMOTE_SOURCES: RemoteSource[] = [
  {
    id: "himalayas",
    label: "Himalayas",
    cost: "free",
    signup: "https://himalayas.app/jobs/api",
    run: fromHimalayas,
  },
  {
    id: "remotive",
    label: "Remotive",
    cost: "free",
    signup: "https://remotive.com/api/remote-jobs",
    run: fromRemotive,
  },
  {
    id: "remoteok",
    label: "Remote OK",
    cost: "free",
    signup: "https://remoteok.com/api",
    run: fromRemoteOK,
  },
  {
    id: "jobicy",
    label: "Jobicy",
    cost: "free",
    signup: "https://jobicy.com/api/v2/remote-jobs",
    run: fromJobicy,
  },
  {
    id: "workingnomads",
    label: "Working Nomads",
    cost: "free",
    signup: "https://www.workingnomads.com/api/exposed_jobs/",
    run: fromWorkingNomads,
  },
];

export type RemoteResult = { jobs: Job[]; ms: number; error?: string };

export async function runRemote(source: RemoteSource, role: string): Promise<RemoteResult> {
  const t0 = Date.now();
  try {
    const jobs = await source.run(role);
    return { jobs, ms: Date.now() - t0 };
  } catch (e) {
    return { jobs: [], ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

export const REMOTE_POLICY = {
  id: "remote",
  name: "Remote Boards (Himalayas, Remotive, Remote OK, Jobicy, Working Nomads)",
  tier: 1 as const,
  discovery: "public-feed" as const,
  submission: "user-directed" as const,
  auth: [] as const,
  notes: "Public RSS/JSON feeds requiring no login; applications open the target posting URL.",
};
