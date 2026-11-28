// Shared discovery + scoring.
//
// Both the local HTTP API (server/index.ts) and the MCP server
// (server/mcp.ts) call this module, so a tool call and a page load
// always return the same postings with the same scores.

import { dirname } from "node:path";
import { scoreJob, parseRequiredYears } from "@career-ops/career-scoring";
import type { Job, Profile, Preferences } from "@career-ops/contracts";
import { discoverNaukri } from "../connectors/naukri";
import {
  loadSession as loadNaukriApiSession,
  searchJobs as searchNaukriApi,
  status as naukriApiStatus,
} from "../connectors/naukriApi";
import { discoverIndeed } from "../connectors/indeed";
import { discoverFoundit } from "../connectors/foundit";
import { discoverApna } from "../connectors/apna";
import { discoverWellfound } from "../connectors/wellfound";
import { AGGREGATORS, runAggregator, type SourceKeys } from "../connectors/aggregators";
import { REMOTE_SOURCES, runRemote } from "../connectors/remote";
import { discoverFreelance } from "../connectors/freelance";
import { activePortals, runCompanyPortal } from "../connectors/companies";
import { categorizeRole } from "./startup-radar";

/* ------------------------------------------------------------------ */
/* sources                                                             */
/* ------------------------------------------------------------------ */

export type Board = {
  id: string;
  kind: "lever" | "greenhouse" | "ashby" | "smart";
  slug: string;
  company: string;
};

/** Verified 2026-11-19 against each board's public API. `india` is the count
 *  of postings that named an Indian city on that day. */
export const BOARDS: Board[] = [
  /* --- Indian startups and product companies --- */
  { id: "lever:meesho", kind: "lever", slug: "meesho", company: "Meesho" }, // 48 / 47
  { id: "lever:paytm", kind: "lever", slug: "paytm", company: "Paytm" }, // 197 / 168
  { id: "lever:hevodata", kind: "lever", slug: "hevodata", company: "Hevo Data" }, // 40 / 39
  { id: "lever:acceldata", kind: "lever", slug: "acceldata", company: "Acceldata" }, // 41 / 16
  { id: "lever:levelai", kind: "lever", slug: "levelai", company: "Level AI" }, // 19 / 16
  { id: "lever:cred", kind: "lever", slug: "cred", company: "CRED" }, // 12 / 11
  { id: "lever:zeta", kind: "lever", slug: "zeta", company: "Zeta" }, // 32 / 28

  { id: "greenhouse:inmobi", kind: "greenhouse", slug: "inmobi", company: "InMobi" }, // 78 / 43
  { id: "greenhouse:zetaglobal", kind: "greenhouse", slug: "zetaglobal", company: "Zeta Global" }, // 101 / 35
  { id: "greenhouse:zenoti", kind: "greenhouse", slug: "zenoti", company: "Zenoti" }, // 56 / 34
  { id: "greenhouse:pubmatic", kind: "greenhouse", slug: "pubmatic", company: "PubMatic" }, // 78 / 31
  { id: "greenhouse:netradyne", kind: "greenhouse", slug: "netradyne", company: "Netradyne" }, // 39 / 24
  { id: "greenhouse:glance", kind: "greenhouse", slug: "glance", company: "Glance" }, // 27 / 15
  { id: "greenhouse:druva", kind: "greenhouse", slug: "druva", company: "Druva" }, // 27 / 11
  { id: "greenhouse:groww", kind: "greenhouse", slug: "groww", company: "Groww" }, // 9 / 9
  { id: "greenhouse:slice", kind: "greenhouse", slug: "slice", company: "slice" }, // 21 / 0

  { id: "ashby:tekion", kind: "ashby", slug: "tekion", company: "Tekion" }, // 90 / 63
  { id: "ashby:sarvam", kind: "ashby", slug: "sarvam", company: "Sarvam AI" }, // 43 / 43
  { id: "ashby:netgear", kind: "ashby", slug: "netgear", company: "NETGEAR" }, // 54 / 32
  { id: "ashby:ddn", kind: "ashby", slug: "ddn", company: "DDN" }, // 87 / 19
  { id: "ashby:snowflake", kind: "ashby", slug: "snowflake", company: "Snowflake" }, // 379 / 12
  { id: "ashby:atlan", kind: "ashby", slug: "atlan", company: "Atlan" }, // 7 / 3
  /* ashby:navi removed 2026-11-27: that board belongs to a San Francisco startup, not Navi India. */
  { id: "ashby:composio", kind: "ashby", slug: "composio", company: "Composio" }, // YC AI Agents
  { id: "greenhouse:razorpay", kind: "greenhouse", slug: "razorpaysoftwareprivatelimited", company: "Razorpay" }, // YC India Fintech

  { id: "smart:swiggy", kind: "smart", slug: "Swiggy", company: "Swiggy" }, // 180 / 56
  { id: "smart:freshworks", kind: "smart", slug: "Freshworks", company: "Freshworks" }, // 123 / 24

  /* --- global product companies with a large India office --- */
  { id: "lever:valgenesis", kind: "lever", slug: "valgenesis", company: "ValGenesis" },
  { id: "lever:mindtickle", kind: "lever", slug: "mindtickle", company: "Mindtickle" },
];

const INDIA = /india|chennai|bengaluru|bangalore|mumbai|hyderabad|pune|gurgaon|gurugram|noida|delhi|kochi|coimbatore|ahmedabad|jaipur|indore/i;
const ELSEWHERE =
  /^[A-Z]{2}-|canada|united kingdom|\buk\b|north macedonia|united states|\busa\b|\bu\.?s\.?\b|washington|\bdc\b|new york|california|texas|seattle|boston|austin|europe|singapore|dubai|australia|germany|poland|brazil|mexico|japan|colombia|finland|sweden|netherlands|ireland|israel|turkey|egypt|south africa|philippines|indonesia|malaysia|thailand|vietnam|korea|china|hong kong|taiwan|new zealand|portugal|italy|switzerland|austria|belgium|denmark|norway|czech|romania|ukraine|argentina|chile|peru/i;

/** A posting is in scope when it names an Indian city, or says India, or is
 *  remote with no other country named. "Remote - UK" is not an Indian job. */
export function inIndia(location: string): boolean {
  if (INDIA.test(location)) return true;
  if (ELSEWHERE.test(location)) return false;
  return /\bremote\b/i.test(location);
}

/** Seniority words that should not decide whether a posting is the role. */
const SENIORITY = new Set([
  "senior", "junior", "sr", "jr", "lead", "principal", "staff", "associate",
  "assistant", "trainee", "intern", "entry", "mid", "chief", "head", "vp",
  "avp", "deputy", "executive", "experienced",
]);

function roleWords(role: string): string[] {
  return role
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !SENIORITY.has(w));
}

/**
 * Does the posting actually look like the role the user asked for?
 *
 * The title decides. A "Business Analyst" posting says so in its title; a
 * Group Product Manager posting that happens to mention "industry analysts"
 * in its marketing copy is not a Business Analyst role. Description text is
 * only used to confirm a title that already carries most of the role words.
 */
const ROLE_FILLER_WORDS = new Set(["job", "jobs", "related", "role", "roles", "openings", "opening", "position", "positions", "work", "career", "careers", "vacancies"]);

export function matchesRole(title: string, description: string, role: string): boolean {
  if (!role) return true;
  const rawWords = roleWords(role);
  const meaningful = rawWords.filter((w) => !ROLE_FILLER_WORDS.has(w.toLowerCase()));
  const words = meaningful.length ? meaningful : rawWords;
  if (!words.length) return true;

  const titleText = title.toLowerCase();
  const titleHits = words.filter((w) => new RegExp(`\\b${w}`, "i").test(titleText)).length;

  /* Two- and three-word roles are short enough to require the whole phrase
     in the title: "business analyst", "data analyst", "product manager". */
  if (words.length <= 3) return titleHits === words.length;

  /* Longer roles (e.g. "quantum computing research scientist") allow the
     description to fill in the tail, but the title must carry most of it. */
  const need = Math.ceil(words.length * 0.6);
  if (titleHits >= need) return true;
  if (titleHits < Math.ceil(words.length / 2)) return false;
  const hay = `${title} ${description.slice(0, 1200)}`.toLowerCase();
  const hits = words.filter((w) => new RegExp(`\\b${w}`, "i").test(hay)).length;
  return hits >= need;
}

export function stripHtml(s: string): string {
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

export function workMode(t: string): "remote" | "hybrid" | "office" | undefined {
  if (/\bremote\b|work from home|wfh/i.test(t)) return "remote";
  if (/\bhybrid\b/i.test(t)) return "hybrid";
  if (/\bon-?site\b|in-?office|from office/.test(t)) return "office";
  return undefined;
}

async function getJson(url: string, ms = 25000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "career-ops-india/0.1" },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fromLever(b: Board, now: Date): Promise<Job[]> {
  const rows = (await getJson(`https://api.lever.co/v0/postings/${b.slug}?mode=json`)) as any[];
  return rows.map((p) => {
    const loc = p.categories?.location ?? p.categories?.allLocations?.[0] ?? "";
    const desc = [
      p.descriptionPlain ? stripHtml(p.descriptionPlain) : stripHtml(p.description ?? ""),
      ...(p.lists ?? []).map((l: any) => `## ${l.text ?? ""}\n${stripHtml(l.content ?? "")}`),
      p.additionalPlain ? stripHtml(p.additionalPlain) : "",
    ].filter(Boolean).join("\n\n");
    return {
      id: `lever:${b.slug}:${p.id}`,
      sourceId: "lever",
      sourceUrl: p.hostedUrl ?? `https://jobs.lever.co/${b.slug}/${p.id}`,
      ...(p.applyUrl ? { applyUrl: p.applyUrl } : {}),
      company: b.company,
      title: p.text,
      location: loc,
      country: "IN",
      ...(workMode(`${loc} ${desc}`) ? { workMode: workMode(`${loc} ${desc}`) } : {}),
      description: desc,
      ...(p.createdAt ? { datePosted: new Date(p.createdAt).toISOString() } : {}),
      firstSeenAt: now.toISOString(),
      status: "open" as const,
      ...(p.categories?.commitment ? { employmentType: p.categories.commitment } : {}),
      ...(p.categories?.department ? { department: p.categories.department } : {}),
    } as Job;
  });
}

async function fromGreenhouse(b: Board, now: Date): Promise<Job[]> {
  const data = (await getJson(`https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs?content=true`)) as any;
  return (data.jobs ?? []).map((p: any) => {
    const loc = p.location?.name ?? "";
    const desc = stripHtml(p.content ?? "");
    return {
      id: `greenhouse:${b.slug}:${p.id}`,
      sourceId: "greenhouse",
      sourceUrl: p.absolute_url,
      company: b.company,
      title: p.title,
      location: loc,
      country: "IN",
      ...(workMode(`${loc} ${desc}`) ? { workMode: workMode(`${loc} ${desc}`) } : {}),
      description: desc,
      ...(p.updated_at ? { datePosted: new Date(p.updated_at).toISOString() } : {}),
      firstSeenAt: now.toISOString(),
      status: "open" as const,
      ...(p.departments?.[0]?.name ? { department: p.departments[0].name } : {}),
    } as Job;
  });
}

async function fromAshby(b: Board, now: Date): Promise<Job[]> {
  const data = (await getJson(`https://api.ashbyhq.com/posting-api/job-board/${b.slug}`)) as any;
  return (data.jobs ?? []).map((p: any) => {
    const loc = p.location ?? "";
    const desc = stripHtml(p.descriptionHtml ?? "");
    return {
      id: `ashby:${b.slug}:${p.id}`,
      sourceId: "ashby",
      sourceUrl: p.jobUrl,
      ...(p.applyUrl ? { applyUrl: p.applyUrl } : {}),
      company: b.company,
      title: p.title,
      location: loc,
      country: "IN",
      ...(workMode(`${loc} ${p.workplaceType ?? ""} ${desc}`) ? { workMode: workMode(`${loc} ${p.workplaceType ?? ""} ${desc}`) } : {}),
      description: desc,
      ...(p.publishedAt ? { datePosted: new Date(p.publishedAt).toISOString() } : {}),
      firstSeenAt: now.toISOString(),
      status: "open" as const,
      ...(p.employmentType ? { employmentType: p.employmentType } : {}),
      ...(p.department ? { department: p.department } : {}),
    } as Job;
  });
}

/* SmartRecruiters returns no description in the list call, so the India
   postings get one detail call each. Capped and run 8 at a time: Swiggy has
   180 postings and fetching all of them would cost more than the page is worth. */
async function fromSmartRecruiters(b: Board, now: Date): Promise<Job[]> {
  const data = (await getJson(
    `https://api.smartrecruiters.com/v1/companies/${b.slug}/postings?limit=100`,
  )) as any;
  const rows = (data.content ?? []).filter((p: any) => inIndia(String(p.location?.fullLocation ?? "")));

  const out: Job[] = [];
  const queue = rows.slice(0, 40);
  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const p = queue[i++];
      let desc = "";
      try {
        const d = (await getJson(
          `https://api.smartrecruiters.com/v1/companies/${b.slug}/postings/${p.id}`,
          12000,
        )) as any;
        desc = [
          d?.jobAd?.sections?.jobDescription?.text,
          d?.jobAd?.sections?.qualifications?.text,
          d?.jobAd?.sections?.additionalInformation?.text,
        ]
          .filter(Boolean)
          .map((t: unknown) => stripHtml(String(t)))
          .join("\n\n");
      } catch {
        /* a missing description is better than a missing posting */
      }
      const loc = p.location?.fullLocation ?? p.location?.city ?? "";
      out.push({
        id: `smart:${b.slug}:${p.id}`,
        sourceId: "smartrecruiters",
        sourceUrl: `https://jobs.smartrecruiters.com/${b.slug}/${p.id}`,
        company: b.company,
        title: p.name,
        location: loc,
        country: "IN",
        ...(workMode(`${loc} ${desc}`) ? { workMode: workMode(`${loc} ${desc}`) } : {}),
        description: desc,
        ...(p.releasedDate ? { datePosted: new Date(p.releasedDate).toISOString() } : {}),
        firstSeenAt: now.toISOString(),
        status: "open" as const,
        ...(p.typeOfEmployment?.label ? { employmentType: p.typeOfEmployment.label } : {}),
        ...(p.department?.label ? { department: p.department.label } : {}),
      } as Job);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

const FETCHERS = { lever: fromLever, greenhouse: fromGreenhouse, ashby: fromAshby, smart: fromSmartRecruiters };

/* A board that answered a minute ago does not need asking again. This is what
   makes a reload instant instead of another 30-second wait. */
const BOARD_TTL_MS = 5 * 60 * 1000;
/* With 27 boards, one slow host must not hold the page. A board that misses
   this deadline is reported as timed out and retried on the next load. */
const BOARD_DEADLINE_MS = 18000;

type Cached = { at: number; jobs: Job[]; error?: string; refreshing?: boolean };
const boardCache = new Map<string, Cached>();
/* The refresh in flight for each board. A request that lands while a board
   has never answered waits on this, instead of reading the empty placeholder
   and reporting "0 jobs" for a board that has 150 (seen live 2026-11-27 for
   Swiggy, Freshworks and ValGenesis on the first load after start). */
const inFlight = new Map<string, Promise<void>>();

async function fetchBoard(b: Board): Promise<{ jobs: Job[]; error?: string }> {
  const attempt = (async (): Promise<{ jobs: Job[]; error?: string }> => {
    for (let i = 0; i < 2; i++) {
      try {
        return { jobs: await FETCHERS[b.kind](b, new Date()) };
      } catch (e) {
        if (i === 1) return { jobs: [], error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { jobs: [], error: "unreachable" };
  })();

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<{ jobs: Job[]; error?: string }>((resolve) => {
    timer = setTimeout(() => resolve({ jobs: [], error: `timed out after ${BOARD_DEADLINE_MS} ms` }), BOARD_DEADLINE_MS);
    timer.unref?.();
  });

  const r = await Promise.race([attempt, deadline]);
  if (timer) clearTimeout(timer);
  return r;
}

/** Refresh one board in the background. Never awaited by a request. */
function refreshBoard(b: Board): void {
  const prev = boardCache.get(b.id);
  if (prev?.refreshing) return;
  boardCache.set(b.id, { at: prev?.at ?? 0, jobs: prev?.jobs ?? [], refreshing: true });
  const job = withSlot(() =>
    fetchBoard(b)
      .then((r) => {
        /* keep the last good postings when a refresh fails */
        const keep = r.error && prev?.jobs.length ? prev.jobs : r.jobs;
        boardCache.set(b.id, { at: Date.now(), jobs: keep, ...(r.error ? { error: r.error } : {}) });
      })
      .catch(() => {
        boardCache.set(b.id, { at: prev?.at ?? 0, jobs: prev?.jobs ?? [] });
      }),
  ).finally(() => inFlight.delete(b.id));
  inFlight.set(b.id, job);
}

/* 27 boards refreshing at once starves the event loop and makes the page
   itself slow. Six at a time keeps the request path responsive. */
const REFRESH_CONCURRENCY = 6;
let refreshActive = 0;
const refreshQueue: Array<() => void> = [];

function withSlot(task: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve) => {
    const run = () => {
      refreshActive++;
      void task().finally(() => {
        refreshActive--;
        const next = refreshQueue.shift();
        if (next) next();
        resolve();
      });
    };
    if (refreshActive < REFRESH_CONCURRENCY) run();
    else refreshQueue.push(run);
  });
}

export async function runBoard(b: Board): Promise<{ board: Board; jobs: Job[]; ms: number; error?: string }> {
  const t0 = Date.now();
  const hit = boardCache.get(b.id);

  /* Stale-while-revalidate: an old answer is served immediately and the
     refresh happens behind the request. Only a cold board is awaited. */
  if (hit && hit.at === 0 && inFlight.has(b.id)) {
    /* cold, but the warm-up is already fetching it: wait for that */
    await Promise.race([inFlight.get(b.id), new Promise((r) => setTimeout(r, BOARD_DEADLINE_MS + 1000))]);
    const now = boardCache.get(b.id) ?? hit;
    return { board: b, jobs: now.jobs, ms: Date.now() - t0, ...(now.error ? { error: now.error } : {}) };
  }
  if (hit) {
    if (Date.now() - hit.at > BOARD_TTL_MS) refreshBoard(b);
    return { board: b, jobs: hit.jobs, ms: Date.now() - t0, ...(hit.error ? { error: hit.error } : {}) };
  }

  const r = await fetchBoard(b);
  boardCache.set(b.id, { at: Date.now(), jobs: r.jobs, ...(r.error ? { error: r.error } : {}) });
  return { board: b, jobs: r.jobs, ms: Date.now() - t0, ...(r.error ? { error: r.error } : {}) };
}

/** Called once at server start so the first page load is not the warm-up. */
export function warmBoards(): void {
  for (const b of BOARDS) refreshBoard(b);
}

/* ------------------------------------------------------------------ */
/* request -> profile                                                  */
/* ------------------------------------------------------------------ */

export type JobRequest = {
  role?: string;
  cities?: string[];
  modes?: string[];
  years?: number;
  skills?: string[];
  responsibilities?: string[];
  /** "public" = ATS feeds, "naukri", "indeed", and each signed-in board with a
      connector ("foundit"). Default: public, naukri, indeed. */
  sources?: string[];
  /** A neighbourhood inside the city (Velachery in Chennai). Postings
      that name it rank first among matches. */
  locality?: string;
  /** Keep every role the company boards list, related or not. Default: only
      the role, its progressions and neighbours (ADR-035). */
  keepOthers?: boolean;
  /** Called as each source answers, so the page can show results at once. */
  onBatch?: (b: { group: string; jobs: ScoredJob[]; connectors: ConnectorStatus[] }) => void;
  /** Where the persistent Chrome profile lives. */
  profileDir?: string;
  /** Max postings to return. */
  limit?: number;
  /** Minimum expected salary (LPA) forwarded to scoring. */
  minSalaryLpa?: number;
  /** Hard freshness cutoff in days (e.g. 7, 14, 30) to filter stale employer listings. */
  maxAgeDays?: number;
  /** Keys for the licensed aggregators (Adzuna, Jooble, Careerjet). */
  sourceKeys?: SourceKeys;
};

export function profileFor(req: JobRequest): Profile {
  const city = req.cities?.[0] || "Chennai";
  return {
    id: "local",
    fullName: "You",
    location: { city, country: "IN" },
    links: {},
    experience: [],
    education: [],
    skills: req.skills ?? [],
    ...(typeof req.years === "number" ? { yearsExperience: req.years } : {}),
    confirmedAt: new Date().toISOString(),
  };
}

export function prefsFor(req: JobRequest): Preferences {
  const minSalaryLpa = (req as JobRequest & { minSalaryLpa?: number }).minSalaryLpa;
  return {
    roles: req.role ? [req.role] : [],
    cities: req.cities ?? [],
    workModes: (req.modes ?? []).map((m) => m.toLowerCase()).filter((m) => ["remote", "hybrid", "office"].includes(m)) as any,
    levels: [],
    excludeCompanies: [],
    ...(typeof minSalaryLpa === "number" && minSalaryLpa > 0 ? { minSalaryLpa } : {}),
  };
}

export const BREAKDOWN_LABEL: Record<string, string> = {
  roleFit: "Role fit",
  skills: "Skills",
  experience: "Experience",
  industry: "Industry",
  location: "Location",
  ownership: "Ownership",
  compensation: "Compensation",
};

export const BREAKDOWN_MAX: Record<string, number> = {
  roleFit: 25, skills: 25, experience: 15, industry: 10, location: 10, ownership: 10, compensation: 5,
};

/* ------------------------------------------------------------------ */
/* one call: discover, filter, score, dedupe                           */
/* ------------------------------------------------------------------ */

export type ScoredJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: string;
  source: string;
  sourceUrl: string;
  applyUrl: string;
  datePosted: string | null;
  firstSeenAt: string;
  ageDays?: number;
  category?: string;
  experienceAsked?: string;
  score: number;
  relationship: string;
  matched: boolean;
  breakdown: Array<{ k: string; got: number; max: number }>;
  have: string[];
  miss: string[];
  explain: string;
  /** The posting names the user's own neighbourhood (req.locality). */
  near?: boolean;
  /** An excerpt for the detail pane. The full text stays on the source page. */
  jd: string;
  /** Only when the source states it. Never estimated. */
  salary?: string;
  /**
   * True when the source sent no usable description, so the score was built
   * from the title, location and stated experience only. The UI says so
   * rather than presenting a title-only number as a full match.
   */
  partial?: boolean;
  live: true;
};

export type ConnectorStatus = {
  id: string;
  ok: boolean;
  count: number;
  ms: number;
  needsHuman?: string;
  error?: string;
};

export type DiscoveryResult = {
  jobs: ScoredJob[];
  total: number;
  matched: number;
  /** Unrelated roles from the company boards, left out (keepOthers keeps them). */
  hidden?: number;
  connectors: ConnectorStatus[];
  scoredAt: string;
};

/** One posting -> the shape the UI renders. Shared by discovery and by the
 *  on-demand read of a posting page, so a re-score cannot drift from a first
 *  score. */
export function scoreOne(
  job: Job,
  req: JobRequest,
  profile: Profile,
  prefs: Preferences,
): ScoredJob {
  const s = scoreJob({ profile, preferences: prefs, job, responsibilities: req.responsibilities ?? [] });
  let matched = matchesRole(job.title, job.description, req.role ?? "");
  /* An experienced candidate (2+ yrs) shouldn't see Intern/Fresher postings matched as equal fits unless they searched for them. */
  const candidateYears = req.years ?? 0;
  const titleIsIntern = /\b(intern|internship|trainee|apprentice|fresher)\b/i.test(job.title);
  const roleWantsIntern = /\b(intern|internship|trainee|apprentice|fresher)\b/i.test(req.role ?? "");
  let totalScore = s.total;
  if (candidateYears >= 2 && titleIsIntern && !roleWantsIntern) {
    matched = false;
    totalScore = Math.max(0, totalScore - 30);
  }
  const expReq = parseRequiredYears(job.description);
  const ageDays = job.datePosted
    ? Math.max(0, Math.round((Date.now() - Date.parse(job.datePosted)) / 86_400_000))
    : undefined;
  const cat = categorizeRole(job.title, job.description);
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode ?? "not stated",
    source: job.sourceId,
    sourceUrl: job.sourceUrl,
    applyUrl: job.applyUrl ?? job.sourceUrl,
    datePosted: job.datePosted ?? null,
    firstSeenAt: job.firstSeenAt,
    score: Math.round(totalScore * 10) / 10,
    ...(ageDays !== undefined && Number.isFinite(ageDays) ? { ageDays } : {}),
    category: cat.label,
    ...(expReq !== undefined ? { experienceAsked: `${expReq}+ yrs` } : {}),
    relationship: s.relationship,
    matched,
    breakdown: Object.entries(s.breakdown).map(([k, got]) => ({
      k: BREAKDOWN_LABEL[k] ?? k,
      got: Math.round((got as number) * 10) / 10,
      max: BREAKDOWN_MAX[k] ?? 0,
    })),
    have: (req.skills ?? []).filter((sk) => job.description.toLowerCase().includes(sk.toLowerCase())),
    miss: s.missing.slice(0, 6),
    explain: s.explanation ?? "",
    /* 1,200 characters is enough for the detail pane. Sending the whole
       description for every posting made the payload 7.6 MB. */
    jd: job.description.slice(0, 1200),
    /* A card with no description cannot produce a real skills or industry
       score. Say so instead of showing a confident-looking number. */
    ...(job.description.replace(/\s+/g, " ").trim().length < 120 ? { partial: true } : {}),
    ...((job as { salary?: string }).salary ? { salary: (job as { salary?: string }).salary } : {}),
    live: true,
  };
}

export async function discoverJobs(req: JobRequest): Promise<DiscoveryResult> {  const sources = Array.isArray(req.sources) ? req.sources : ["public", "naukri", "indeed"];
  const usePublic = sources.includes("public");
  const useNaukri = sources.includes("naukri");
  const useIndeed = sources.includes("indeed");
  /* search engines and key feeds run unless a caller asks for one source alone ("no-engines") */
  const useEngines = !sources.includes("no-engines");

  /* one pipeline for a batch and for the whole: India only, the date cut-off,
     the score, "near you"; then the company boards' unrelated roles go */
  const maxAgeDays = typeof req.maxAgeDays === "number" && req.maxAgeDays > 0 ? req.maxAgeDays : undefined;
  const cutoffMs = maxAgeDays ? Date.now() - maxAgeDays * 86_400_000 : 0;
  const profile = profileFor(req);
  const prefs = prefsFor(req);
  const loc = String(req.locality || "").trim();
  const nearRx = loc.length >= 3 ? new RegExp("\\b" + loc.replace(/[^a-z0-9 ]/gi, "") + "\\b", "i") : null;
  const keep = (j: Job): boolean => {
    if (!inIndia(j.location)) return false;
    if (cutoffMs && j.datePosted) {
      const t = Date.parse(j.datePosted);
      if (Number.isFinite(t) && t < cutoffMs) return false;
    }
    return true;
  };
  const prep = (jobs: Job[]): ScoredJob[] =>
    jobs.filter(keep).map((job) => {
      const sj = scoreOne(job, req, profile, prefs);
      if (nearRx && nearRx.test(`${sj.location} ${job.description || ""}`)) sj.near = true;
      return sj;
    });
  /* "Cluster Manager" at a company that also hires PMs is not a PM lead */
  const noise = (sj: ScoredJob): boolean => !req.keepOthers && !sj.matched && sj.relationship === "separate";
  const emit = (group: string, jobs: Job[], connectors: ConnectorStatus[]): void => {
    if (!req.onBatch || (!jobs.length && !connectors.length)) return;
    try { req.onBatch({ group, jobs: prep(jobs).filter((x) => !noise(x)), connectors }); } catch { /* a closed page must not stop the search */ }
  };
  const st = (id: string, jobs: Job[], ms: number, error?: string): ConnectorStatus => ({ id, ok: !error, count: jobs.length, ms, ...(error ? { error } : {}) } as ConnectorStatus);

  /* The ATS feeds and the Naukri browser are independent, so they run at the
     same time. Sequentially the page waited for the slowest feed *plus* Naukri. */
  const naukriTask: Promise<{ jobs: Job[]; status: ConnectorStatus | null }> =
    useNaukri && req.role
      ? (async () => {
          const t0 = Date.now();
          /* Signed in: use Naukri's own API first. No browser, respects the
             candidate's years (the browser path searches as a fresher), and
             it is the faster of the two. The browser is the fallback. */
          try {
            const dataDir = req.profileDir ? dirname(req.profileDir) : "data";
            await loadNaukriApiSession(dataDir);
            if (naukriApiStatus().signedIn) {
              const maxAge = typeof req.maxAgeDays === "number" && req.maxAgeDays > 0 ? Math.min(30, req.maxAgeDays) : 30;
              const ask = (page: number) => searchNaukriApi({
                role: req.role!,
                city: req.cities?.[0],
                experience: req.years,
                limit: 25,
                jobAge: maxAge,
                page,
              });
              /* two pages: one was eleven postings after filtering */
              const apiRes = await ask(1);
              if ((apiRes.total ?? 0) > 25) {
                const p2 = await ask(2).catch(() => null);
                if (p2) apiRes.jobs.push(...p2.jobs.filter((j) => !apiRes.jobs.some((x) => x.id === j.id)));
              }
              if (apiRes.jobs.length > 0) {
                return {
                  jobs: apiRes.jobs,
                  status: { id: "naukri", ok: true, count: apiRes.jobs.length, ms: Date.now() - t0 } as ConnectorStatus,
                };
              }
            }
          } catch {
            /* fall through to the browser connector */
          }
          const n = await discoverNaukri({
            role: req.role!,
            city: req.cities?.[0],
            profileDir: req.profileDir || "data/browser-profile",
            limit: req.limit ?? 20,
          });
          if (n.jobs.length > 0) {
            return {
              jobs: n.jobs,
              status: {
                id: "naukri",
                ok: !n.needsHuman && !n.message,
                count: n.jobs.length,
                ms: Date.now() - t0,
                ...(n.needsHuman ? { needsHuman: n.needsHuman } : {}),
                ...(n.message ? { error: n.message } : {}),
              } as ConnectorStatus,
            };
          }
          /* Browser DOM missed cards -> fall back to signed-in Naukri API if available */
          try {
            const dataDir = req.profileDir ? dirname(req.profileDir) : "data";
            await loadNaukriApiSession(dataDir);
            if (naukriApiStatus().signedIn) {
              const apiRes = await searchNaukriApi({
                role: req.role!,
                city: req.cities?.[0],
                experience: req.years,
                limit: req.limit ?? 25,
                jobAge: 30,
              });
              if (apiRes.jobs.length > 0) {
                return {
                  jobs: apiRes.jobs,
                  status: {
                    id: "naukri",
                    ok: true,
                    count: apiRes.jobs.length,
                    ms: Date.now() - t0,
                  } as ConnectorStatus,
                };
              }
            }
          } catch {
            /* fall through to original browser connector status */
          }
          return {
            jobs: n.jobs,
            status: {
              id: "naukri",
              ok: !n.needsHuman && !n.message,
              count: n.jobs.length,
              ms: Date.now() - t0,
              ...(n.needsHuman ? { needsHuman: n.needsHuman } : {}),
              ...(n.message ? { error: n.message } : {}),
            } as ConnectorStatus,
          };
        })()
      : Promise.resolve({ jobs: [] as Job[], status: null });

  /* Indeed needs its own profile: two persistent Chrome contexts cannot share
     one profile directory, and Naukri is already using the default one. */
  const indeedTask: Promise<{ jobs: Job[]; status: ConnectorStatus | null }> =
    useIndeed && req.role
      ? (async () => {
          const t0 = Date.now();
          const n = await discoverIndeed({
            role: req.role!,
            city: req.cities?.[0],
            profileDir: req.profileDir ? `${req.profileDir}-indeed` : "data/browser-profile-indeed",
            limit: req.limit ?? 20,
            /* streamed searches can wait for the user to pass Indeed's check */
            ...(req.onBatch ? { onWait: () => req.onBatch!({ group: "indeed-wait", jobs: [], connectors: [{ id: "indeed", ok: false, count: 0, ms: 0, needsHuman: "captcha", waiting: true } as ConnectorStatus] }) } : {}),
          });
          return {
            jobs: n.jobs,
            status: {
              id: "indeed",
              ok: !n.needsHuman && !n.message,
              count: n.jobs.length,
              ms: Date.now() - t0,
              ...(n.needsHuman ? { needsHuman: n.needsHuman } : {}),
              ...(n.message ? { error: n.message } : {}),
            } as ConnectorStatus,
          };
        })()
      : Promise.resolve({ jobs: [] as Job[], status: null });

  /* foundit, in the user's signed-in session (connectors/foundit.ts) */
  const founditTask: Promise<{ jobs: Job[]; status: ConnectorStatus | null }> =
    sources.includes("foundit") && req.role
      ? (async () => {
          const t0 = Date.now();
          const n = await discoverFoundit({ role: req.role!, city: req.cities?.[0], profileDir: req.profileDir || "data/browser-profile", limit: 60 });
          return {
            jobs: n.jobs,
            status: {
              id: "foundit",
              ok: !n.needsHuman && !n.message,
              count: n.jobs.length,
              ms: Date.now() - t0,
              ...(n.needsHuman ? { needsHuman: n.needsHuman } : {}),
              ...(n.message ? { error: n.message } : {}),
            } as ConnectorStatus,
          };
        })()
      : Promise.resolve({ jobs: [] as Job[], status: null });

  /* Apna, from its role-and-city page (connectors/apna.ts) */
  const apnaTask: Promise<{ jobs: Job[]; status: ConnectorStatus | null }> =
    /* a public page: part of every search, signed in or not */
    (sources.includes("apna") || usePublic) && req.role
      ? (async () => {
          const t0 = Date.now();
          const n = await discoverApna({ role: req.role!, city: req.cities?.[0], limit: 40 });
          return { jobs: n.jobs, status: { id: "apna", ok: !n.needsHuman && !n.message, count: n.jobs.length, ms: Date.now() - t0, ...(n.needsHuman ? { needsHuman: n.needsHuman } : {}), ...(n.message ? { error: n.message } : {}) } as ConnectorStatus };
        })()
      : Promise.resolve({ jobs: [] as Job[], status: null });

  /* Wellfound, in the user's signed-in session (connectors/wellfound.ts) */
  const wellfoundTask: Promise<{ jobs: Job[]; status: ConnectorStatus | null }> =
    sources.includes("wellfound") && req.role
      ? (async () => {
          const t0 = Date.now();
          const n = await discoverWellfound({ role: req.role!, profileDir: req.profileDir || "data/browser-profile", pages: 1 });
          return { jobs: n.jobs, status: { id: "wellfound", ok: !n.needsHuman && !n.message, count: n.jobs.length, ms: Date.now() - t0, ...(n.needsHuman ? { needsHuman: n.needsHuman } : {}), ...(n.message ? { error: n.message } : {}) } as ConnectorStatus };
        })()
      : Promise.resolve({ jobs: [] as Job[], status: null });

  const [publicRuns, companyRuns, naukri, indeed, aggregatorRuns, remoteRuns, freelanceRun, foundit, apna, wellfound] = await Promise.all([
    (usePublic ? Promise.all(BOARDS.map(runBoard)) : Promise.resolve([])).then((runs) => {
      emit("boards", runs.flatMap((r) => r.jobs), runs.map((r) => st(r.board.id, r.jobs, r.ms, r.error)));
      return runs;
    }),
    /* Employer career portals: Tesla, EPAM, Amazon, and Workday when enabled. */
    (usePublic ? Promise.all(activePortals().map(runCompanyPortal)) : Promise.resolve([])).then((runs) => {
      emit("companies", runs.flatMap((r) => r.jobs), runs.map((r) => st(r.portal.id, r.jobs, r.ms, r.error)));
      return runs;
    }),
    naukriTask.then((r) => { emit("naukri", r.jobs, r.status ? [r.status] : []); return r; }),
    indeedTask.then((r) => { emit("indeed", r.jobs, r.status ? [r.status] : []); return r; }),
    /* Licensed aggregators and search engines run when the user stored a key. */
    (useEngines && req.role && req.sourceKeys
      ? Promise.all(
          AGGREGATORS.filter((a) => !a.paid).map(async (a) => {
            const result = await runAggregator(a, req.role!, req.cities?.[0], req.sourceKeys!);
            if (result.error !== "no key") emit(a.id, result.jobs, [st(a.id, result.jobs, result.ms, result.error)]);
            return { aggregator: a, result };
          }),
        )
      : Promise.resolve([])),
    /* The free remote boards need no key, so they always run. */
    (usePublic
      ? Promise.all(
          REMOTE_SOURCES.map(async (s) => ({ source: s, result: await runRemote(s, req.role ?? "") })),
        )
      : Promise.resolve([])).then((runs) => {
      emit("remote", runs.flatMap((r) => r.result.jobs), runs.map((r) => st(r.source.id, r.result.jobs, r.result.ms, r.result.error)));
      return runs;
    }),
    /* Freelance projects: open API, no key. Remote by nature. */
    (usePublic && req.role
      ? discoverFreelance(req.role, 20)
      : Promise.resolve({ jobs: [] as Job[], ms: 0, error: undefined as string | undefined })).then((r) => {
      if (usePublic && req.role) emit("freelancer", r.jobs, [st("freelancer", r.jobs, r.ms, r.error)]);
      return r;
    }),
    founditTask.then((r) => { emit("foundit", r.jobs, r.status ? [r.status] : []); return r; }),
    apnaTask.then((r) => { emit("apna", r.jobs, r.status ? [r.status] : []); return r; }),
    wellfoundTask.then((r) => { emit("wellfound", r.jobs, r.status ? [r.status] : []); return r; }),
  ]);

  const naukriJobs = naukri.jobs;
  const naukriStatus = naukri.status;
  const indeedJobs = indeed.jobs;
  const indeedStatus = indeed.status;

  const aggregatorJobs = aggregatorRuns.flatMap((r) => r.result.jobs);
  const remoteJobs = remoteRuns.flatMap((r) => r.result.jobs);

  const all = [
    ...publicRuns.flatMap((r) => r.jobs),
    ...companyRuns.flatMap((r) => r.jobs),
    ...remoteJobs,
    ...freelanceRun.jobs,
    ...naukriJobs,
    ...indeedJobs,
    ...foundit.jobs,
    ...apna.jobs,
    ...wellfound.jobs,
    ...aggregatorJobs,
  ].filter(keep);

  const scoredAll: ScoredJob[] = prep(all);
  const hidden = scoredAll.filter(noise).length;
  const scored = scoredAll.filter((x) => !noise(x));

  /* Matched first, then near the user, then postings with a real date before
     undated ones, then by score. A three-day-old posting should outrank an
     undated one. */
  scored.sort(
    (a, b) =>
      Number(b.matched) - Number(a.matched) ||
      Number(Boolean(b.near)) - Number(Boolean(a.near)) ||
      Number(Boolean(b.datePosted)) - Number(Boolean(a.datePosted)) ||
      b.score - a.score,
  );

  /* the same posting can arrive from two sources; keep the first */
  const seen = new Set<string>();
  const deduped = scored.filter((j) => {
    const key = `${j.title.toLowerCase().trim()}|${j.company.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    jobs: deduped,
    total: all.length,
    /** unrelated roles from the company boards, left out (keepOthers brings them back) */
    hidden,
    matched: deduped.filter((j) => j.matched).length,
    connectors: [
      ...publicRuns.map((r) => ({
        id: r.board.id,
        ok: !r.error,
        count: r.jobs.length,
        ms: r.ms,
        ...(r.error ? { error: r.error } : {}),
      })),
      ...companyRuns.map((r) => ({
        id: r.portal.id,
        ok: !r.error,
        count: r.jobs.length,
        ms: r.ms,
        ...(r.error ? { error: r.error } : {}),
      })),
      ...remoteRuns.map((r) => ({
        id: r.source.id,
        ok: !r.result.error,
        count: r.result.jobs.length,
        ms: r.result.ms,
        ...(r.result.error ? { error: r.result.error } : {}),
      })),
      {
        id: "freelancer",
        ok: !freelanceRun.error,
        count: freelanceRun.jobs.length,
        ms: freelanceRun.ms,
        ...(freelanceRun.error ? { error: freelanceRun.error } : {}),
      },
      ...(naukriStatus ? [naukriStatus] : []),
      ...(indeedStatus ? [indeedStatus] : []),
      ...(foundit.status ? [foundit.status] : []),
      ...(apna.status ? [apna.status] : []),
      ...(wellfound.status ? [wellfound.status] : []),
      ...aggregatorRuns.map((r) => ({
        id: r.aggregator.id,
        ok: !r.result.error,
        count: r.result.jobs.length,
        ms: r.result.ms,
        ...(r.result.error ? { error: r.result.error } : {}),
      })),
    ],
    scoredAt: new Date().toISOString(),
  };
}
