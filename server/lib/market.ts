// The market view: how many jobs exist for a role, where, and how they relate
// to the role the candidate typed.
//
// The console's step 2 asks "India, Remote, or a state?" and shows a funnel.
// The numbers come from the same scored postings the workspace uses; nothing
// here invents a count. Role families come from the taxonomy package, so
// "Senior PM" is a progression and "Product Owner" is adjacent, not a synonym.

import { findRole, relationshipBetween, ROLES, type RoleNode } from "@career-ops/career-taxonomy";
import type { ScoredJob } from "./discovery";

/* City -> state, so "Chennai" and "Tamil Nadu" are the same filter. Order
   matters: a specific state is checked before Delhi NCR, so Gurugram is
   Haryana and Noida is Uttar Pradesh, not both NCR. Kept in step with the
   workspace's own filter. */
export const STATE_ALIASES: Record<string, string[]> = {
  "tamil nadu": ["tamil nadu", "chennai", "coimbatore", "madurai", "tiruchirappalli", "trichy", "salem", "tirunelveli", "vellore", "erode", "thanjavur", "hosur", "ooty"],
  karnataka: ["karnataka", "bengaluru", "bangalore", "mysuru", "mysore", "mangaluru", "hubballi", "belagavi", "davanagere"],
  telangana: ["telangana", "hyderabad", "secunderabad", "warangal", "nizamabad"],
  "andhra pradesh": ["andhra pradesh", "visakhapatnam", "vijayawada", "guntur", "tirupati", "nellore", "rajahmundry"],
  maharashtra: ["maharashtra", "mumbai", "pune", "nagpur", "thane", "navi mumbai", "nashik", "aurangabad", "kolhapur"],
  haryana: ["haryana", "gurugram", "gurgaon", "faridabad", "panipat", "ambala", "karnal"],
  "uttar pradesh": ["uttar pradesh", "noida", "greater noida", "lucknow", "kanpur", "varanasi", "agra", "ghaziabad", "meerut"],
  "delhi ncr": ["delhi", "new delhi", "ncr"],
  "west bengal": ["west bengal", "kolkata", "howrah", "siliguri", "durgapur"],
  gujarat: ["gujarat", "ahmedabad", "surat", "vadodara", "rajkot", "gandhinagar"],
  kerala: ["kerala", "kochi", "cochin", "thiruvananthapuram", "trivandrum", "kozhikode", "calicut", "thrissur"],
  rajasthan: ["rajasthan", "jaipur", "jodhpur", "udaipur", "kota"],
  "madhya pradesh": ["madhya pradesh", "indore", "bhopal", "jabalpur", "gwalior"],
  punjab: ["punjab", "ludhiana", "amritsar", "jalandhar"],
  chandigarh: ["chandigarh", "mohali", "panchkula"],
  odisha: ["odisha", "orissa", "bhubaneswar", "cuttack", "rourkela"],
  assam: ["assam", "guwahati", "dispur", "silchar"],
  uttarakhand: ["uttarakhand", "dehradun", "haridwar", "rishikesh"],
  goa: ["goa", "panaji", "margao"],
  bihar: ["bihar", "patna", "gaya"],
  jharkhand: ["jharkhand", "ranchi", "jamshedpur"],
  chhattisgarh: ["chhattisgarh", "raipur", "bhilai"],
  "himachal pradesh": ["himachal pradesh", "shimla", "manali"],
  "jammu and kashmir": ["jammu", "kashmir", "srinagar"],
};

export const STATE_KEYS = Object.keys(STATE_ALIASES);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function stateOf(job: Pick<ScoredJob, "location" | "title" | "jd">): string {
  const loc = String(job.location || "").toLowerCase();
  if (/\b(remote|work from home|wfh|anywhere)\b/.test(loc)) return "remote";
  const hay = `${loc} ${String(job.title || "").toLowerCase()} ${String(job.jd || "").toLowerCase()}`;
  for (const state of STATE_KEYS) {
    if (STATE_ALIASES[state].some((k) => new RegExp(`\\b${escapeRe(k)}\\b`).test(hay))) return state;
  }
  return "";
}

export function isRemote(job: Pick<ScoredJob, "location" | "workMode">): boolean {
  return (
    String(job.workMode || "").toLowerCase() === "remote" ||
    /\b(remote|work from home|wfh|anywhere)\b/i.test(String(job.location || ""))
  );
}

export type FamilyGroup = {
  key: "core" | "progression" | "adjacent" | "specialisation";
  label: string;
  count: number;
  titles: string[];
  roles: string[];
};

const FAMILY_LABEL: Record<FamilyGroup["key"], string> = {
  core: "Core",
  progression: "Adjacent · one step up or down",
  adjacent: "Alternative paths",
  specialisation: "Specialisations",
};

/** Which family a posting belongs to, relative to the role the user typed.
 *  "separate" means the title is not on this career path at all; it is not a
 *  family and is left out of the funnel. */
export function familyOf(
  targetTitle: string,
  jobTitle: string
): FamilyGroup["key"] | "separate" | null {
  const target = findRole(targetTitle);
  const job = findRole(jobTitle);
  if (!target || !job) return null;
  const rel = relationshipBetween(target.id, job.id);
  if (rel === "core") return "core";
  if (rel === "progression") return "progression";
  if (rel === "adjacent") return "adjacent";
  if (rel === "specialisation") return "specialisation";
  return "separate";
}

export type MarketSummary = {
  role: string;
  total: number;
  matched: number;
  counts: {
    india: number;
    remote: number;
    state: number;
    city: number;
    posted7d: number;
  };
  state?: string;
  city?: string;
  families: FamilyGroup[];
  trending: Array<{ title: string; count: number }>;
  shortlist: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    workMode: string;
    source: string;
    sourceUrl: string;
    applyUrl: string;
    score: number;
    relationship: string;
    family: FamilyGroup["key"] | "separate" | null;
    datePosted: string | null;
  }>;
  scoredAt: string;
};

const TRENDING = ["ai product manager", "ai pm", "0 to 1", "0-1", "genai", "llm"];

export function marketSummary(
  jobs: ScoredJob[],
  opts: { role: string; state?: string; city?: string; remote?: boolean; limit?: number }
): MarketSummary {
  const role = String(opts.role || "").trim();
  const state = String(opts.state || "").toLowerCase().trim();
  const city = String(opts.city || "").toLowerCase().trim();
  const wantRemote = Boolean(opts.remote);

  const inState = (j: ScoredJob) => (state ? stateOf(j) === state : true);
  const inCity = (j: ScoredJob) =>
    city ? `${j.location} ${j.title}`.toLowerCase().includes(city) : true;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const posted7d = (j: ScoredJob) => {
    const t = Date.parse(String(j.datePosted || j.firstSeenAt || ""));
    return Number.isFinite(t) && t >= sevenDaysAgo;
  };

  const geoFiltered = jobs.filter((j) => {
    if (wantRemote && !isRemote(j)) return false;
    if (state && !inState(j)) return false;
    if (city && !inCity(j)) return false;
    return true;
  });

  const groups = new Map<FamilyGroup["key"], { count: number; titles: Set<string>; roles: Set<string> }>();
  for (const key of Object.keys(FAMILY_LABEL) as FamilyGroup["key"][]) {
    groups.set(key, { count: 0, titles: new Set(), roles: new Set() });
  }
  for (const j of geoFiltered) {
    const fam = familyOf(role, j.title);
    if (!fam || fam === "separate") continue;
    const g = groups.get(fam)!;
    g.count++;
    g.titles.add(j.title);
    g.roles.add(j.company);
  }

  const families: FamilyGroup[] = (Object.keys(FAMILY_LABEL) as FamilyGroup["key"][])
    .map((key) => {
      const g = groups.get(key)!;
      return {
        key,
        label: FAMILY_LABEL[key],
        count: g.count,
        titles: [...g.titles].slice(0, 8),
        roles: [...g.roles].slice(0, 8),
      };
    })
    .filter((g) => g.count > 0);

  const trendingMap = new Map<string, number>();
  for (const j of geoFiltered) {
    const t = `${j.title} ${j.jd}`.toLowerCase();
    if (TRENDING.some((k) => t.includes(k))) {
      trendingMap.set(j.title, (trendingMap.get(j.title) || 0) + 1);
    }
  }
  const trending = [...trendingMap.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 10));
  const shortlist = [...geoFiltered]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      workMode: j.workMode,
      source: j.source,
      sourceUrl: j.sourceUrl,
      applyUrl: j.applyUrl,
      score: j.score,
      relationship: j.relationship,
      family: familyOf(role, j.title),
      datePosted: j.datePosted,
    }));

  return {
    role,
    total: jobs.length,
    matched: jobs.filter((j) => j.matched).length,
    counts: {
      india: jobs.length,
      remote: jobs.filter(isRemote).length,
      state: state ? jobs.filter(inState).length : jobs.length,
      city: city ? jobs.filter(inCity).length : jobs.length,
      posted7d: jobs.filter(posted7d).length,
    },
    ...(state ? { state } : {}),
    ...(city ? { city } : {}),
    families,
    trending,
    shortlist,
    scoredAt: new Date().toISOString(),
  };
}

/** The role nodes reachable from a target, for the "alternative paths" list. */
export function relatedRoles(targetTitle: string): Array<{ title: string; relationship: string }> {
  const target = findRole(targetTitle);
  if (!target) return [];
  return ROLES.filter((r) => r.id !== target.id)
    .map((r: RoleNode) => ({ title: r.title, relationship: relationshipBetween(target.id, r.id) }))
    .filter((r) => r.relationship !== "separate");
}
