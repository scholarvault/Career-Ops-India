// Shared discovery + scoring.
//
// Both the local HTTP API (server/index.ts) and the MCP server
// (server/mcp.ts) call this module, so a tool call and a page load
// always return the same postings with the same scores.

import { scoreJob } from "@career-ops/career-scoring";
import type { Job, Profile, Preferences } from "@career-ops/contracts";
import { discoverNaukri } from "../connectors/naukri";
import { discoverIndeed } from "../connectors/indeed";
import { AGGREGATORS, runAggregator, type SourceKeys } from "../connectors/aggregators";
import { REMOTE_SOURCES, runRemote } from "../connectors/remote";
import { discoverFreelance } from "../connectors/freelance";

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
  { id: "ashby:navi", kind: "ashby", slug: "navi", company: "Navi" }, // 2 / 0

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
export function matchesRole(title: string, description: string, role: string): boolean {
  if (!role) return true;
  const words = roleWords(role);
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

function workMode(t: string): "remote" | "hybrid" | "office" | undefined {
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
        desc = stripHtml(d?.jobAd?.sections?.jobDescription?.text ?? "");
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
  void withSlot(() =>
    fetchBoard(b)
      .then((r) => {
        /* keep the last good postings when a refresh fails */
        const keep = r.error && prev?.jobs.length ? prev.jobs : r.jobs;
        boardCache.set(b.id, { at: Date.now(), jobs: keep, ...(r.error ? { error: r.error } : {}) });
      })
      .catch(() => {
        boardCache.set(b.id, { at: prev?.at ?? 0, jobs: prev?.jobs ?? [] });
      }),
  );
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
  /** "public" = ATS feeds, "naukri" = local browser. Default: both. */
  sources?: string[];
  /** Where the persistent Chrome profile lives. */
  profileDir?: string;
  /** Max postings to return. */
  limit?: number;
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
  return {
    roles: req.role ? [req.role] : [],
    cities: req.cities ?? [],
    workModes: (req.modes ?? []).map((m) => m.toLowerCase()).filter((m) => ["remote", "hybrid", "office"].includes(m)) as any,
    levels: [],
    excludeCompanies: [],
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
  score: number;
  relationship: string;
  matched: boolean;
  breakdown: Array<{ k: string; got: number; max: number }>;
  have: string[];
  miss: string[];
  explain: string;
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
  const matched = matchesRole(job.title, job.description, req.role ?? "");
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
    score: Math.round(s.total * 10) / 10,
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

  /* The ATS feeds and the Naukri browser are independent, so they run at the
     same time. Sequentially the page waited for the slowest feed *plus* Naukri. */
  const naukriTask: Promise<{ jobs: Job[]; status: ConnectorStatus | null }> =
    useNaukri && req.role
      ? (async () => {
          const t0 = Date.now();
          const n = await discoverNaukri({
            role: req.role!,
            city: req.cities?.[0],
            profileDir: req.profileDir || "data/browser-profile",
            limit: req.limit ?? 20,
          });
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

  const [publicRuns, naukri, indeed, aggregatorRuns, remoteRuns, freelanceRun] = await Promise.all([
    usePublic ? Promise.all(BOARDS.map(runBoard)) : Promise.resolve([]),
    naukriTask,
    indeedTask,
    /* Licensed aggregators only run when the user stored a key for them. */
    req.role && req.sourceKeys
      ? Promise.all(
          AGGREGATORS.filter((a) => !a.paid).map(async (a) => ({
            aggregator: a,
            result: await runAggregator(a, req.role!, req.cities?.[0], req.sourceKeys!),
          })),
        )
      : Promise.resolve([]),
    /* The free remote boards need no key, so they always run. */
    usePublic
      ? Promise.all(
          REMOTE_SOURCES.map(async (s) => ({ source: s, result: await runRemote(s, req.role ?? "") })),
        )
      : Promise.resolve([]),
    /* Freelance projects: open API, no key. Remote by nature. */
    usePublic && req.role
      ? discoverFreelance(req.role, 20)
      : Promise.resolve({ jobs: [] as Job[], ms: 0 }),
  ]);

  const naukriJobs = naukri.jobs;
  const naukriStatus = naukri.status;
  const indeedJobs = indeed.jobs;
  const indeedStatus = indeed.status;

  const aggregatorJobs = aggregatorRuns.flatMap((r) => r.result.jobs);
  const remoteJobs = remoteRuns.flatMap((r) => r.result.jobs);

  const all = [
    ...publicRuns.flatMap((r) => r.jobs),
    ...remoteJobs,
    ...freelanceRun.jobs,
    ...naukriJobs,
    ...indeedJobs,
    ...aggregatorJobs,
  ].filter((j) => inIndia(j.location));

  const profile = profileFor(req);
  const prefs = prefsFor(req);

  const scored: ScoredJob[] = all.map((job) => scoreOne(job, req, profile, prefs));

  /* Matched first, then postings with a real date before undated ones,
     then by score. A three-day-old posting should outrank an undated one. */
  scored.sort(
    (a, b) =>
      Number(b.matched) - Number(a.matched) ||
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
    matched: deduped.filter((j) => j.matched).length,
    connectors: [
      ...publicRuns.map((r) => ({
        id: r.board.id,
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
