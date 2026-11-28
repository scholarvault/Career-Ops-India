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

/* Bengaluru's Hosur Road is not Hosur, Tamil Nadu. */
const unroad = (s: string) => s.replace(/\bhosur\s+(main\s+)?road\b/gi, " ");

function stateIn(text: string): string {
  for (const state of STATE_KEYS) {
    if ((STATE_ALIASES[state] ?? []).some((k) => new RegExp(`\\b${escapeRe(k)}\\b`).test(text))) return state;
  }
  return "";
}

/* The posting's own location decides. The description is read only when the
   location names no place at all: a Bengaluru role whose description says
   "we also have offices in Chennai" is not a Chennai role. */
export function stateOf(job: Pick<ScoredJob, "location" | "title" | "jd">): string {
  const loc = unroad(String(job.location || "").toLowerCase());
  if (/\b(remote|work from home|wfh|anywhere)\b/.test(loc)) return "remote";
  const fromLoc = stateIn(loc);
  if (fromLoc) return fromLoc;
  return stateIn(unroad(`${String(job.title || "")} ${String(job.jd || "").slice(0, 1200)}`.toLowerCase()));
}

export function isRemote(job: Pick<ScoredJob, "location" | "workMode">): boolean {
  return (
    String(job.workMode || "").toLowerCase() === "remote" ||
    /\b(remote|work from home|wfh|anywhere)\b/i.test(String(job.location || ""))
  );
}

export type LocalityDef = {
  id: string;
  label: string;
  city: string;
  state: string;
  aliases: string[];
};

/** Indian metro micro-localities, industrial/EV corridors, and PIN-code zones. */
export const LOCALITY_ALIASES: LocalityDef[] = [
  // Chennai & Tamil Nadu corridors
  { id: "chennai-thiruvottiyur", label: "Thiruvottiyur / North Chennai", city: "Chennai", state: "tamil nadu", aliases: ["thiruvottiyur", "tiruvottiyur", "600019", "ennore", "manali", "tondiarpet", "madhavaram", "perambur", "royapuram", "north chennai"] },
  { id: "chennai-guindy", label: "Guindy / Ekkaduthangal", city: "Chennai", state: "tamil nadu", aliases: ["guindy", "ekkaduthangal", "600032", "alwarpet"] },
  { id: "chennai-omr-tidel", label: "OMR / Tidel Park / Perungudi", city: "Chennai", state: "tamil nadu", aliases: ["omr", "old mahabalipuram", "tidel park", "taramani", "perungudi", "thoraipakkam", "600096", "600113"] },
  { id: "chennai-sholinganallur", label: "Sholinganallur / Siruseri (SIPCOT)", city: "Chennai", state: "tamil nadu", aliases: ["sholinganallur", "siruseri", "sipcot", "navalur", "kelambakkam", "600119", "603103"] },
  { id: "chennai-ambattur", label: "Ambattur Industrial Estate", city: "Chennai", state: "tamil nadu", aliases: ["ambattur", "padi", "korattur", "avadi", "600058", "600053"] },
  { id: "chennai-sriperumbudur", label: "Sriperumbudur / Oragadam (EV/Auto)", city: "Chennai", state: "tamil nadu", aliases: ["sriperumbudur", "oragadam", "maraimalai nagar", "irungattukottai", "mahindra world city", "chengalpattu", "602105"] },
  { id: "chennai-central", label: "Adyar / T. Nagar / Nungambakkam", city: "Chennai", state: "tamil nadu", aliases: ["adyar", "t nagar", "t. nagar", "nungambakkam", "velachery", "mylapore", "anna nagar", "600020", "600017", "600034"] },
  { id: "chennai-porur", label: "Porur / DLF IT Park", city: "Chennai", state: "tamil nadu", aliases: ["porur", "dlf it park", "manapakkam", "600089", "600116"] },
  { id: "tn-coimbatore", label: "Coimbatore / Hosur", city: "Coimbatore / Hosur", state: "tamil nadu", aliases: ["coimbatore", "saravanampatti", "tidel coimbatore", "hosur", "krishnagiri"] },
  // Bengaluru
  { id: "blr-whitefield", label: "Whitefield / ITPL", city: "Bengaluru", state: "karnataka", aliases: ["whitefield", "itpl", "mahadevapura", "hoodi", "560066"] },
  { id: "blr-koramangala-hsr", label: "Koramangala / HSR Layout", city: "Bengaluru", state: "karnataka", aliases: ["koramangala", "hsr layout", "hsr", "btm", "jayanagar", "560034", "560102"] },
  { id: "blr-indiranagar", label: "Indiranagar / MG Road / Domlur", city: "Bengaluru", state: "karnataka", aliases: ["indiranagar", "domlur", "mg road", "ulsoor", "egl", "560038"] },
  { id: "blr-orr", label: "Outer Ring Road / Bellandur", city: "Bengaluru", state: "karnataka", aliases: ["bellandur", "marathahalli", "outer ring road", "sarjapur", "ecospace", "560103"] },
  { id: "blr-ecity", label: "Electronic City / Peenya (EV)", city: "Bengaluru", state: "karnataka", aliases: ["electronic city", "peenya", "yelahanka", "hebbal", "manyata", "560100"] },
  // Hyderabad, Mumbai, Pune, NCR
  { id: "hyd-hitec", label: "HITEC City / Gachibowli", city: "Hyderabad", state: "telangana", aliases: ["hitec", "madhapur", "gachibowli", "kondapur", "financial district", "banjara hills", "jubilee hills", "500081", "500032"] },
  { id: "mum-bkc-powai", label: "BKC / Lower Parel / Powai", city: "Mumbai", state: "maharashtra", aliases: ["bkc", "bandra kurla", "lower parel", "powai", "andheri", "goregaon", "airoli", "400051", "400076"] },
  { id: "pune-hinjawadi", label: "Hinjawadi / Baner / Kharadi", city: "Pune", state: "maharashtra", aliases: ["hinjawadi", "hinjewadi", "baner", "kharadi", "magarpatta", "viman nagar", "chakan", "411057"] },
  { id: "ncr-cybercity", label: "Cyber City / Udyog Vihar / Noida 62", city: "Delhi NCR", state: "haryana", aliases: ["cyber city", "cyber hub", "udyog vihar", "sector 62", "sector 125", "connaught place", "aerocity"] },
];

const CITY_MATCHERS: Array<{ label: string; state: string; rx: RegExp }> = [
  { label: "Remote India", state: "remote", rx: /\b(remote|work from home|wfh|anywhere)\b/i },
  { label: "Chennai", state: "tamil nadu", rx: /\b(chennai|madras|thiruvottiyur|guindy|omr|sholinganallur|siruseri|ambattur|sriperumbudur|oragadam|porur|adyar|600\d{3})\b/i },
  { label: "Coimbatore / Hosur", state: "tamil nadu", rx: /\b(coimbatore|hosur|madurai|trichy|tiruchirappalli|salem|vellore)\b/i },
  { label: "Bengaluru", state: "karnataka", rx: /\b(bengaluru|bangalore|whitefield|koramangala|indiranagar|hsr|bellandur|electronic city|560\d{3})\b/i },
  { label: "Hyderabad", state: "telangana", rx: /\b(hyderabad|secunderabad|gachibowli|madhapur|hitec|500\d{3})\b/i },
  { label: "Mumbai", state: "maharashtra", rx: /\b(mumbai|navi mumbai|thane|powai|lower parel|bkc|400\d{3})\b/i },
  { label: "Pune", state: "maharashtra", rx: /\b(pune|hinjawadi|hinjewadi|kharadi|baner|411\d{3})\b/i },
  { label: "Gurugram", state: "haryana", rx: /\b(gurugram|gurgaon|cyber city|122\d{3})\b/i },
  { label: "Noida", state: "uttar pradesh", rx: /\b(noida|greater noida|201\d{3})\b/i },
  { label: "Delhi", state: "delhi ncr", rx: /\b(new delhi|delhi|ncr|110\d{3})\b/i },
  { label: "Kolkata", state: "west bengal", rx: /\b(kolkata|salt lake|new town|700\d{3})\b/i },
  { label: "Ahmedabad / GIFT", state: "gujarat", rx: /\b(ahmedabad|gandhinagar|gift city|surat|vadodara)\b/i },
  { label: "Kochi / Trivandrum", state: "kerala", rx: /\b(kochi|cochin|thiruvananthapuram|trivandrum|technopark|infopark)\b/i },
];

export function cityOf(job: Pick<ScoredJob, "location" | "workMode" | "title" | "jd">): { label: string; state: string } | null {
  const loc = unroad(String(job.location || ""));
  for (const c of CITY_MATCHERS) {
    if (c.label === "Remote India") continue;
    if (c.rx.test(loc)) return { label: c.label, state: c.state };
  }
  if (isRemote(job)) return { label: "Remote India", state: "remote" };
  const hay = unroad(`${loc} ${String(job.title || "")} ${String(job.jd || "").slice(0, 600)}`);
  for (const c of CITY_MATCHERS) {
    if (c.label === "Remote India") continue;
    if (c.rx.test(hay)) return { label: c.label, state: c.state };
  }
  return null;
}

export function localityOf(job: Pick<ScoredJob, "location" | "title" | "jd">): LocalityDef | null {
  const hit = (text: string) =>
    LOCALITY_ALIASES.find((d) => d.aliases.some((a) => new RegExp(`\\b${escapeRe(a)}\\b`, "i").test(text))) ?? null;
  const fromLoc = hit(unroad(String(job.location || "").toLowerCase()));
  if (fromLoc) return fromLoc;
  /* An office address in the description counts only when it agrees with the
     posting's own city and state. */
  const d = hit(unroad(`${String(job.title || "")} ${String(job.jd || "").slice(0, 900)}`.toLowerCase()));
  if (!d) return null;
  const c = cityOf({ location: job.location, title: "", jd: "", workMode: "" } as Pick<ScoredJob, "location" | "workMode" | "title" | "jd">);
  if (c) return c.label === d.city ? d : null;
  return stateOf({ location: job.location, title: "", jd: "" }) === d.state ? d : null;
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

export type GeoBucket = {
  key: string;
  label: string;
  count: number;
  sharePct: number;
  state?: string;
  city?: string;
};

export type GeoDistribution = {
  india: number;
  remote: number;
  requestedLocality?: {
    name: string;
    count: number;
    nearbyCity: string;
    nearbyCityCount: number;
    note: string;
  };
  byState: GeoBucket[];
  byCity: GeoBucket[];
  byLocality: GeoBucket[];
  bySource: Array<{ source: string; count: number }>;
};

export type MarketSummary = {
  role: string;
  /** Postings for the role (exact title, a step up, or a specialisation). */
  total: number;
  /** Every posting the sources returned, before the role filter. */
  scanned: number;
  matched: number;
  counts: {
    india: number;
    remote: number;
    state: number;
    city: number;
    locality: number;
    posted7d: number;
  };
  state?: string;
  city?: string;
  locality?: string;
  geoDistribution: GeoDistribution;
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

export function buildGeoDistribution(
  jobs: ScoredJob[],
  opts: { city?: string; locality?: string } = {}
): GeoDistribution {
  const total = Math.max(1, jobs.length);
  const stateMap = new Map<string, number>();
  const cityMap = new Map<string, { label: string; state: string; count: number }>();
  const locMap = new Map<string, { label: string; city: string; state: string; count: number }>();
  const srcMap = new Map<string, number>();
  let remote = 0;

  for (const j of jobs) {
    if (isRemote(j)) remote++;
    const st = stateOf(j) || (isRemote(j) ? "remote" : "pan-india / unspecified");
    stateMap.set(st, (stateMap.get(st) || 0) + 1);

    const c = cityOf(j);
    if (c) {
      const ck = c.label.toLowerCase();
      const prev = cityMap.get(ck) ?? { label: c.label, state: c.state, count: 0 };
      prev.count++;
      cityMap.set(ck, prev);
    }

    const loc = localityOf(j);
    if (loc) {
      const prev = locMap.get(loc.id) ?? { label: loc.label, city: loc.city, state: loc.state, count: 0 };
      prev.count++;
      locMap.set(loc.id, prev);
    }

    srcMap.set(j.source, (srcMap.get(j.source) || 0) + 1);
  }

  const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const byState: GeoBucket[] = [...stateMap.entries()]
    .map(([key, count]) => ({
      key,
      label: key === "remote" ? "Remote / WFH" : titleCase(key),
      count,
      sharePct: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  const byCity: GeoBucket[] = [...cityMap.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      state: v.state,
      count: v.count,
      sharePct: Math.round((v.count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  const byLocality: GeoBucket[] = [...locMap.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      city: v.city,
      state: v.state,
      count: v.count,
      sharePct: Math.round((v.count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  const bySource = [...srcMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  let requestedLocality: GeoDistribution["requestedLocality"];
  const reqLocRaw = String(opts.locality || "").trim();
  if (reqLocRaw) {
    const reqLoc = reqLocRaw.toLowerCase();
    const matchedDef = LOCALITY_ALIASES.find(
      (d) =>
        d.label.toLowerCase().includes(reqLoc) ||
        d.aliases.some((a) => a.toLowerCase() === reqLoc || reqLoc.includes(a.toLowerCase()))
    );
    const terms = matchedDef ? matchedDef.aliases : [reqLoc];
    const locCount = jobs.filter((j) => {
      const hay = `${j.location} ${j.title} ${j.jd}`.toLowerCase();
      return terms.some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, "i").test(hay));
    }).length;
    const nearbyCity = matchedDef?.city || (opts.city ? titleCase(opts.city) : "Chennai");
    const nearbyCityCount = cityMap.get(nearbyCity.toLowerCase())?.count ?? 0;
    requestedLocality = {
      name: reqLocRaw,
      count: locCount,
      nearbyCity,
      nearbyCityCount,
      note: locCount
        ? `${locCount} posting(s) explicitly mention ${reqLocRaw} (${nearbyCity} total: ${nearbyCityCount}).`
        : `0 postings explicitly mention "${reqLocRaw}". ${nearbyCityCount} active posting(s) found across nearby ${nearbyCity} corridors.`,
    };
  }

  return {
    india: jobs.length,
    remote,
    ...(requestedLocality ? { requestedLocality } : {}),
    byState,
    byCity,
    byLocality,
    bySource,
  };
}

export function marketSummary(
  jobs: ScoredJob[],
  opts: { role: string; state?: string; city?: string; locality?: string; remote?: boolean; limit?: number; maxAgeDays?: number }
): MarketSummary {
  const role = String(opts.role || "").trim();
  const state = String(opts.state || "").toLowerCase().trim();
  const city = String(opts.city || "").toLowerCase().trim();
  const locality = String(opts.locality || "").toLowerCase().trim();
  const wantRemote = Boolean(opts.remote);
  const cutoffMs = typeof opts.maxAgeDays === "number" && opts.maxAgeDays > 0 ? Date.now() - opts.maxAgeDays * 86_400_000 : 0;

  const agePool = cutoffMs
    ? jobs.filter((j) => {
        if (!j.datePosted) return true;
        const t = Date.parse(String(j.datePosted));
        return !Number.isFinite(t) || t >= cutoffMs;
      })
    : jobs;

  const inState = (j: ScoredJob) => (state ? stateOf(j) === state : true);
  const inCity = (j: ScoredJob) => {
    if (!city) return true;
    const c = cityOf(j);
    if (c) return c.label.toLowerCase().includes(city) || city.includes(c.label.toLowerCase());
    return String(j.location || "").toLowerCase().includes(city);
  };

  /* The funnel counts the role, not everything the sources returned:
     the exact title, a step up, or a specialisation. Adjacent roles are
     listed separately under families. */
  const ROLE_FAMS = new Set(["core", "progression", "specialisation"]);
  const rolePool = agePool.filter((j) => j.matched || ROLE_FAMS.has(String(familyOf(role, j.title))));
  const matchedLocDef = locality
    ? LOCALITY_ALIASES.find(
        (d) =>
          d.label.toLowerCase().includes(locality) ||
          d.aliases.some((a) => a.toLowerCase() === locality || locality.includes(a.toLowerCase()))
      )
    : undefined;
  const inLocality = (j: ScoredJob) => {
    if (!locality) return true;
    const hay = `${j.location} ${j.title} ${j.jd}`.toLowerCase();
    const terms = matchedLocDef ? matchedLocDef.aliases : [locality];
    return terms.some((t) => new RegExp(`\\b${escapeRe(t)}\\b`, "i").test(hay));
  };

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const posted7d = (j: ScoredJob) => {
    const t = Date.parse(String(j.datePosted || j.firstSeenAt || ""));
    return Number.isFinite(t) && t >= sevenDaysAgo;
  };

  /* Apply state/city/remote directly; apply locality only if at least one posting matched it explicitly,
     otherwise fall back to metro city/state while keeping requestedLocality honest in geoDistribution. */
  const locHits = locality ? rolePool.filter(inLocality).length : 0;
  const geoFiltered = agePool.filter((j) => {
    if (wantRemote && !isRemote(j)) return false;
    if (state && !inState(j)) return false;
    if (city && !inCity(j)) return false;
    if (locality && locHits > 0 && !inLocality(j)) return false;
    return true;
  });

  const geoDistribution = buildGeoDistribution(rolePool, {
    city: opts.city,
    locality: opts.locality,
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
  const roleIds = new Set(rolePool.map((j) => j.id));
  for (const j of geoFiltered) {
    if (!roleIds.has(j.id)) continue;
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
  const withFam = geoFiltered.map((j) => ({ j, fam: familyOf(role, j.title) }));
  const careerOnly = withFam.filter((x) => x.j.matched || (x.fam !== null && x.fam !== "separate"));
  const pool = careerOnly.length > 0 ? careerOnly : withFam;
  const famRank: Record<string, number> = { core: 4, progression: 3, specialisation: 2, adjacent: 1 };
  const shortlist = pool
    .sort(
      (a, b) =>
        Number(b.j.matched) - Number(a.j.matched) ||
        (famRank[b.fam ?? ""] || 0) - (famRank[a.fam ?? ""] || 0) ||
        b.j.score - a.j.score
    )
    .slice(0, limit)
    .map(({ j, fam }) => ({
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
      family: fam,
      datePosted: j.datePosted,
      matched: j.matched,
      ...(j.salary ? { salary: j.salary } : {}),
      ...(j.have ? { have: j.have } : {}),
      ...(j.miss ? { miss: j.miss } : {}),
      ...(j.jd ? { jd: j.jd } : {}),
    }));

  return {
    role,
    total: rolePool.length,
    scanned: agePool.length,
    matched: agePool.filter((j) => j.matched).length,
    counts: {
      india: rolePool.length,
      remote: rolePool.filter(isRemote).length,
      state: state ? rolePool.filter(inState).length : rolePool.length,
      city: city ? rolePool.filter(inCity).length : state ? rolePool.filter(inState).length : rolePool.length,
      locality: locality ? locHits : city ? rolePool.filter(inCity).length : state ? rolePool.filter(inState).length : rolePool.length,
      posted7d: rolePool.filter(posted7d).length,
    },
    ...(state ? { state } : {}),
    ...(city ? { city } : {}),
    ...(locality ? { locality } : {}),
    geoDistribution,
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
