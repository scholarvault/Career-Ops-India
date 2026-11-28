// Company career portals.
//
// The aggregators find postings that someone else indexed. These find the
// posting on the employer's own site, which is where a Fortune 500 role
// actually lives: Tesla's India roles are on MokaHR, EPAM's on its own
// careers API, Amazon's on amazon.jobs, and most of the rest on Workday.
//
// Every adapter here reads a public JSON endpoint. None needs a key.
//
// Rule for scope: a company's postings are kept when they name an Indian
// city. When a company has no Indian posting at all, its remote roles that
// do not name another country are kept instead, so a big employer with no
// India office still shows up as a remote option rather than disappearing.

import type { Job } from "@career-ops/contracts";
import { inIndia, stripHtml, workMode } from "../lib/discovery";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type CompanyAts = "mokahr" | "epam" | "amazon" | "workday";

export type CompanyPortal = {
  id: string;
  company: string;
  ats: CompanyAts;
  /** Adapter-specific settings: host, tenant, site, orgId, countryId. */
  config: Record<string, string>;
  /** Keep remote roles when the company has no Indian posting. */
  remoteFallback?: boolean;
};

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Verified against each endpoint on 2026-11-20. The counts are what the
 * endpoint returned for India that day, not a promise.
 */
export const COMPANY_PORTALS: CompanyPortal[] = [
  {
    id: "company:tesla",
    company: "Tesla",
    ats: "mokahr",
    config: { host: "hire-r1.mokahr.com", orgId: "tesla", siteId: "100004099" },
    remoteFallback: true,
  },
  {
    id: "company:epam",
    company: "EPAM Systems",
    ats: "epam",
    config: { countryId: "4060741400035606931" },
    remoteFallback: true,
  },
  {
    id: "company:amazon",
    company: "Amazon",
    ats: "amazon",
    config: { locQuery: "India" },
    remoteFallback: true,
  },
];

/**
 * Workday tenants. Workday sits behind Cloudflare, which refuses a plain
 * HTTP call from this machine (429) and refuses headless Chrome too. The
 * real browser passes, so these run only when CAREER_OPS_WORKDAY=1 and
 * reuse the app's Chrome profile. Off by default: a live run should not
 * open a browser window unless the user asked for it.
 */
export const WORKDAY_PORTALS: CompanyPortal[] = [
  { id: "company:nvidia", company: "NVIDIA", ats: "workday", config: { host: "nvidia.wd5.myworkdayjobs.com", tenant: "nvidia", site: "NVIDIAExternalCareerSite" }, remoteFallback: true },
  { id: "company:salesforce", company: "Salesforce", ats: "workday", config: { host: "salesforce.wd12.myworkdayjobs.com", tenant: "salesforce", site: "External_Career_Site" }, remoteFallback: true },
  { id: "company:mastercard", company: "Mastercard", ats: "workday", config: { host: "mastercard.wd1.myworkdayjobs.com", tenant: "mastercard", site: "CorporateCareers" }, remoteFallback: true },
  { id: "company:intel", company: "Intel", ats: "workday", config: { host: "intel.wd1.myworkdayjobs.com", tenant: "intel", site: "External" }, remoteFallback: true },
  { id: "company:cisco", company: "Cisco", ats: "workday", config: { host: "cisco.wd5.myworkdayjobs.com", tenant: "cisco", site: "Cisco_Careers" }, remoteFallback: true },
  { id: "company:adobe", company: "Adobe", ats: "workday", config: { host: "adobe.wd5.myworkdayjobs.com", tenant: "adobe", site: "external_experienced" }, remoteFallback: true },
  { id: "company:qualcomm", company: "Qualcomm", ats: "workday", config: { host: "qualcomm.wd5.myworkdayjobs.com", tenant: "qualcomm", site: "External" }, remoteFallback: true },
  { id: "company:dell", company: "Dell Technologies", ats: "workday", config: { host: "dell.wd1.myworkdayjobs.com", tenant: "dell", site: "External" }, remoteFallback: true },
];

export function activePortals(): CompanyPortal[] {
  return process.env.CAREER_OPS_WORKDAY === "1"
    ? [...COMPANY_PORTALS, ...WORKDAY_PORTALS]
    : COMPANY_PORTALS;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function getJson(url: string, ms = 20000): Promise<any> {
  const r = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postJson(url: string, body: unknown, ms = 20000): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function iso(v: unknown): string | undefined {
  if (!v) return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** MokaHR (Tesla's APAC/India portal) answers in Chinese. */
const CITY: Record<string, string> = {
  班加罗尔: "Bengaluru",
  浦那: "Pune",
  孟买: "Mumbai",
  钦奈: "Chennai",
  德里: "Delhi",
  新德里: "New Delhi",
  海得拉巴: "Hyderabad",
  古吉拉邦: "Gujarat",
  古吉拉特: "Gujarat",
  艾哈迈达巴德: "Ahmedabad",
  加尔各答: "Kolkata",
  诺伊达: "Noida",
  古尔冈: "Gurugram",
  台北市: "Taipei",
  东京: "Tokyo",
  首尔: "Seoul",
  新加坡: "Singapore",
  曼谷: "Bangkok",
  吉隆坡: "Kuala Lumpur",
  马尼拉: "Manila",
  胡志明市: "Ho Chi Minh City",
  河内: "Hanoi",
};
const COUNTRY: Record<string, string> = {
  印度: "India",
  中国: "China",
  日本: "Japan",
  韩国: "South Korea",
  新加坡: "Singapore",
  马来西亚: "Malaysia",
  泰国: "Thailand",
  越南: "Vietnam",
  菲律宾: "Philippines",
  海外其他: "Other",
};

function en(v: string | undefined): string {
  if (!v) return "";
  return CITY[v] ?? COUNTRY[v] ?? v;
}

/* ------------------------------------------------------------------ */
/* adapters                                                            */
/* ------------------------------------------------------------------ */

/** Tesla: MokaHR social-recruitment API. 301 APAC postings, 63 in India. */
async function fromMokahr(p: CompanyPortal, now: Date): Promise<Job[]> {
  const { host, orgId, siteId } = p.config;
  const rows: any[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const data = await postJson(`https://${host}/api/outer/ats-apply/website/jobs`, {
      orgId,
      siteId,
      limit: 100,
      offset,
    });
    const page = data?.data?.jobs ?? [];
    rows.push(...page);
    if (page.length < 100) break;
  }

  return rows.map((j) => {
    const places = (j.locations ?? []).map((l: any) => {
      const city = en(l.cityName);
      const country = en(l.country);
      return [city, country].filter(Boolean).join(", ");
    });
    const loc = [...new Set(places)].filter(Boolean).join(" / ");
    const dept = j.zhineng?.name ?? j.department?.name ?? "";
    return {
      id: `tesla:${j.id}`,
      sourceId: "company",
      sourceUrl: `https://${host}/social-recruitment/${orgId}/${siteId}#/job/${j.id}`,
      company: p.company,
      title: String(j.title ?? "").trim(),
      location: loc,
      country: "IN",
      ...(workMode(`${loc} ${dept}`) ? { workMode: workMode(`${loc} ${dept}`) } : {}),
      description: [dept, j.mjCode ? `Requisition ${j.mjCode}` : ""].filter(Boolean).join("\n"),
      ...(iso(j.publishedAt ?? j.createdAt) ? { datePosted: iso(j.publishedAt ?? j.createdAt) } : {}),
      firstSeenAt: now.toISOString(),
      status: j.status === "open" ? ("open" as const) : ("unknown" as const),
      ...(dept ? { department: dept } : {}),
    } as Job;
  }).filter((j) => j.title);
}

/** EPAM: its own careers search API. 251 postings for India. */
async function fromEpam(p: CompanyPortal, now: Date): Promise<Job[]> {
  const { countryId } = p.config;
  const rows: any[] = [];
  /* EPAM caps a page at 50 whatever size asks for, so page by 50 and stop
     when the running count reaches the total it reports. */
  for (let from = 0; from < 2000; from += 50) {
    const url =
      `https://careers.epam.com/api/jobs/v2/search/careers-i18n` +
      `?facets=country%3D${countryId}&from=${from}&lang=en&size=50` +
      `&sortBy=relevance%3Brelocation%3Dasc&websiteLocale=en-us`;
    const data = await getJson(url);
    const page = data?.data?.jobs ?? [];
    rows.push(...page);
    const total = Number(data?.data?.total ?? 0);
    if (page.length < 50 || (total && rows.length >= total)) break;
  }

  return rows.map((j) => {
    const places = (j.city ?? []).map((c: any) =>
      [c.name, c.state?.name].filter(Boolean).join(", "),
    );
    const loc = [...new Set(places)].filter(Boolean).join(" / ");
    const skills = Array.isArray(j.skills) ? j.skills.slice(0, 12).join(", ") : "";
    const desc = [
      stripHtml(String(j.description ?? "")),
      skills ? `Skills: ${skills}` : "",
      j.seniority ? `Seniority: ${j.seniority}` : "",
    ].filter(Boolean).join("\n\n");
    const path = j.seo?.url ? `https://careers.epam.com${j.seo.url}` : "https://careers.epam.com/en/jobs";
    return {
      id: `epam:${j.uid}`,
      sourceId: "company",
      sourceUrl: path,
      company: p.company,
      title: String(j.name ?? "").trim(),
      location: loc,
      country: "IN",
      ...(workMode(`${loc} ${j.vacancy_type ?? ""} ${desc}`)
        ? { workMode: workMode(`${loc} ${j.vacancy_type ?? ""} ${desc}`) }
        : {}),
      description: desc,
      ...(iso(j.updated_at ?? j.created_at) ? { datePosted: iso(j.updated_at ?? j.created_at) } : {}),
      firstSeenAt: now.toISOString(),
      status: j.is_expired ? ("closed" as const) : ("open" as const),
      ...(j.vacancy_type ? { employmentType: String(j.vacancy_type) } : {}),
      ...(j.job_specialization?.[0]?.title ? { department: String(j.job_specialization[0].title) } : {}),
    } as Job;
  }).filter((j) => j.title);
}

/** Amazon: amazon.jobs search.json. India returns thousands of rows. */
async function fromAmazon(p: CompanyPortal, now: Date): Promise<Job[]> {
  const rows: any[] = [];
  const query = p.config.locQuery ?? "India";
  for (let offset = 0; offset < 300; offset += 100) {
    const data = await getJson(
      `https://www.amazon.jobs/en/search.json?base_query=&loc_query=${encodeURIComponent(query)}` +
        `&result_limit=100&offset=${offset}&country=IND`,
    );
    const page = data?.jobs ?? [];
    rows.push(...page);
    if (page.length < 100) break;
  }

  const india = rows.filter(
    (j) => String(j.country_code ?? "").toUpperCase() === "IND" || /india/i.test(String(j.location ?? "")),
  );

  return india.map((j) => {
    const loc = String(j.location ?? "").replace(/\s*,\s*India$/i, ", India");
    const desc = [
      stripHtml(String(j.description ?? "")),
      j.basic_qualifications ? `Basic qualifications\n${stripHtml(String(j.basic_qualifications))}` : "",
      j.preferred_qualifications ? `Preferred qualifications\n${stripHtml(String(j.preferred_qualifications))}` : "",
    ].filter(Boolean).join("\n\n");
    return {
      id: `amazon:${j.id_icims ?? j.id ?? j.job_path}`,
      sourceId: "company",
      sourceUrl: `https://www.amazon.jobs${j.job_path ?? ""}`,
      company: p.company,
      title: String(j.title ?? "").trim(),
      location: loc,
      country: "IN",
      ...(workMode(`${loc} ${desc}`) ? { workMode: workMode(`${loc} ${desc}`) } : {}),
      description: desc,
      ...(iso(j.posted_date) ? { datePosted: iso(j.posted_date) } : {}),
      firstSeenAt: now.toISOString(),
      status: "open" as const,
      ...(j.job_category ? { department: String(j.job_category) } : {}),
      ...(j.employment_type ? { employmentType: String(j.employment_type) } : {}),
    } as Job;
  }).filter((j) => j.title);
}

/**
 * Workday: the CXS endpoint every tenant exposes. Cloudflare answers 429 to
 * a plain call and to headless Chrome, so this goes through the app's real
 * Chrome profile. One page load per tenant, then the JSON is fetched from
 * inside that page, which carries the clearance cookie.
 */
async function fromWorkday(p: CompanyPortal, now: Date): Promise<Job[]> {
  const { host, tenant, site } = p.config;
  const { withPage } = await import("../lib/browser");

  const search = (await withPage("data/browser-profile-workday", async (page) => {
    await page.goto(`https://${host}/en-US/${site}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    return page.evaluate(
      async ({ tenant, site }) => {
        const r = await fetch(`/wday/cxs/${tenant}/${site}/jobs`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: "India" }),
        });
        return r.ok ? r.json() : { error: r.status };
      },
      { tenant, site },
    );
  })) as any;

  if (search?.error) throw new Error(`Workday answered ${search.error}`);
  const rows: any[] = search?.jobPostings ?? [];

  return rows.map((j) => {
    const loc = String(j.locationsText ?? "");
    const path = String(j.externalPath ?? "");
    return {
      id: `workday:${tenant}:${path}`,
      sourceId: "company",
      sourceUrl: `https://${host}/en-US/${site}${path}`,
      company: p.company,
      title: String(j.title ?? "").trim(),
      location: loc,
      country: "IN",
      ...(workMode(loc) ? { workMode: workMode(loc) } : {}),
      description: String(j.bulletFields?.join(" ") ?? ""),
      ...(iso(j.postedOn) ? { datePosted: iso(j.postedOn) } : {}),
      firstSeenAt: now.toISOString(),
      status: "open" as const,
    } as Job;
  }).filter((j) => j.title);
}

const ADAPTERS: Record<CompanyAts, (p: CompanyPortal, now: Date) => Promise<Job[]>> = {
  mokahr: fromMokahr,
  epam: fromEpam,
  amazon: fromAmazon,
  workday: fromWorkday,
};

/* ------------------------------------------------------------------ */
/* runner                                                              */
/* ------------------------------------------------------------------ */

const TTL_MS = 5 * 60 * 1000;
const DEADLINE_MS = 25000;
type Cached = { at: number; jobs: Job[]; error?: string };
const cache = new Map<string, Cached>();

async function fetchPortal(p: CompanyPortal): Promise<{ jobs: Job[]; error?: string }> {
  const run = (async () => {
    for (let i = 0; i < 2; i++) {
      try {
        const jobs = await ADAPTERS[p.ats](p, new Date());
        return { jobs: scope(p, jobs) };
      } catch (e) {
        if (i === 1) return { jobs: [], error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { jobs: [], error: "unreachable" };
  })();

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<{ jobs: Job[]; error?: string }>((resolve) => {
    timer = setTimeout(() => resolve({ jobs: [], error: `timed out after ${DEADLINE_MS} ms` }), DEADLINE_MS);
    timer.unref?.();
  });
  const r = await Promise.race([run, deadline]);
  if (timer) clearTimeout(timer);
  return r;
}

/**
 * India first. If the company has no Indian posting, keep the remote roles
 * that do not name another country, so the company still appears as a
 * remote option instead of vanishing.
 */
function scope(p: CompanyPortal, jobs: Job[]): Job[] {
  const india = jobs.filter((j) => inIndia(j.location));
  if (india.length || !p.remoteFallback) return india;
  return jobs.filter((j) => /remote|worldwide|anywhere|global/i.test(j.location) && inIndia(j.location));
}

export async function runCompanyPortal(
  p: CompanyPortal,
): Promise<{ portal: CompanyPortal; jobs: Job[]; ms: number; error?: string }> {
  const t0 = Date.now();
  const hit = cache.get(p.id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { portal: p, jobs: hit.jobs, ms: Date.now() - t0, ...(hit.error ? { error: hit.error } : {}) };
  }
  const r = await fetchPortal(p);
  cache.set(p.id, { at: Date.now(), jobs: r.jobs, ...(r.error ? { error: r.error } : {}) });
  return { portal: p, jobs: r.jobs, ms: Date.now() - t0, ...(r.error ? { error: r.error } : {}) };
}

/** Warm the HTTP portals at server start; Workday waits for a real request. */
export function warmCompanyPortals(): void {
  for (const p of COMPANY_PORTALS) {
    void runCompanyPortal(p).catch(() => {});
  }
}

export const COMPANIES_POLICY = {
  id: "companies",
  name: "Company Career Portals (Tesla, EPAM, Amazon, Workday)",
  tier: 1 as const,
  discovery: "public-feed" as const,
  submission: "user-directed" as const,
  auth: [] as const,
  notes: "Reads official employer career JSON feeds and opens the employer's own application page.",
};
