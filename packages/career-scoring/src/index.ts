import type {
  Job,
  Preferences,
  Profile,
  RoleRelationship,
  Score,
  ScoreBreakdown,
} from "@career-ops/contracts";
import {
  RELATIONSHIP_WEIGHT,
  findRole,
  relationshipBetween,
} from "@career-ops/career-taxonomy";

/**
 * Deterministic, explainable scoring. The model never produces the number.
 * Same inputs always produce the same score — that is the point.
 */

export type ScoreInput = {
  profile: Profile;
  preferences: Preferences;
  job: Job;
  /** Responsibilities the candidate confirmed they performed. */
  responsibilities?: string[];
};

const SKILLS = [
  "roadmap", "product strategy", "user research", "customer discovery", "a/b testing",
  "experimentation", "analytics", "sql", "data analysis", "wireframing", "prototyping",
  "figma", "jira", "agile", "scrum", "kanban", "stakeholder management", "prioritisation",
  "backlog", "user stories", "prd", "requirements", "go-to-market", "gtm", "pricing",
  "positioning", "growth", "retention", "activation", "funnel", "conversion", "api",
  "platform", "saas", "b2b", "b2c", "enterprise", "machine learning", "llm", "genai",
  "data platform", "etl", "python", "excel", "tableau", "looker", "metabase",
  "product lifecycle", "okrs", "kpis", "metrics", "product ops", "product operations",
  "cross-functional", "launch", "discovery", "design thinking", "market research",
  "competitive analysis", "unit economics", "p&l", "budget", "vendor management",
];

const DOMAINS = [
  "fintech", "banking", "payments", "insurance", "healthcare", "healthtech", "edtech",
  "ecommerce", "e-commerce", "marketplace", "logistics", "supply chain", "saas",
  "enterprise software", "ai", "machine learning", "cloud", "devtools", "gaming",
  "media", "travel", "real estate", "agritech", "mobility", "hr tech", "legal tech",
];

const OWNERSHIP_SIGNALS = [
  "owned", "own the", "end to end", "end-to-end", "roadmap", "launched", "led",
  "drove", "built", "shipped", "defined", "established", "scaled", "managed",
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+&./ -]+/g, " ").replace(/\s+/g, " ").trim();
}

function has(haystack: string, needle: string): boolean {
  return haystack.includes(norm(needle));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** "5+ years", "3-5 years", "7-10 Yrs", "minimum 4 years" → 5, 3, 7, 4 */
export function parseRequiredYears(text: string): number | undefined {
  const t = norm(text);
  /* A range comes first: "7-10 yrs" must read as 7, not 10. */
  const range = t.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)/);
  if (range?.[1]) return Number(range[1]);
  const plus = t.match(/(\d+)\s*\+?\s*(?:years?|yrs?)/);
  if (plus?.[1]) return Number(plus[1]);
  return undefined;
}

/** "₹18-24 LPA", "18 LPA", "INR 20,00,000" → 18, 18, 20 */
export function parseSalaryLpa(text: string): number | undefined {
  const t = norm(text);
  const lpa = t.match(/(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*lpa/);
  if (lpa?.[1]) return Number(lpa[1]);
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*lakh/);
  if (lakh?.[1]) return Number(lakh[1]);
  return undefined;
}

function detect(text: string, lexicon: string[]): string[] {
  const t = norm(text);
  return lexicon.filter((k) => has(t, k));
}

function profileText(profile: Profile): string {
  return norm(
    [
      profile.headline ?? "",
      profile.summary ?? "",
      ...profile.skills,
      ...profile.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
      ...profile.education.flatMap((e) => [e.institution, e.degree ?? "", e.field ?? ""]),
    ].join(" \n "),
  );
}

export function scoreJob(input: ScoreInput): Score {
  const { profile, preferences, job, responsibilities = [] } = input;
  const jd = norm(`${job.title} ${job.department ?? ""} ${job.description}`);
  const cv = profileText(profile);

  /* ---------- hard filters ---------- */

  const reasons: string[] = [];

  if (preferences.excludeCompanies.some((c) => has(norm(job.company), c))) {
    reasons.push(`Excluded company: ${job.company}`);
  }

  const jobIsRemote = job.workMode === "remote" || has(jd, "remote");
  const cityHit = preferences.cities.some((c) => has(norm(job.location), c));
  if (preferences.cities.length > 0 && !cityHit && !jobIsRemote) {
    reasons.push(`Location ${job.location || "(not stated)"} is outside ${preferences.cities.join(", ")}`);
  }

  if (
    preferences.workModes.length > 0 &&
    job.workMode &&
    !preferences.workModes.includes(job.workMode)
  ) {
    reasons.push(`Work mode ${job.workMode} not in ${preferences.workModes.join(", ")}`);
  }

  const hardFilter = { passed: reasons.length === 0, reasons };

  /* ---------- role fit (25) ---------- */

  const targetTitle = preferences.roles[0] ?? "";
  const target = findRole(targetTitle);
  const jobRole = findRole(job.title);
  const relationship: RoleRelationship =
    target && jobRole ? relationshipBetween(target.id, jobRole.id) : "separate";

  const relWeight = RELATIONSHIP_WEIGHT[relationship];

  // How much of what the candidate says they did appears in the JD.
  const respHits = responsibilities.filter((r) => {
    const words = norm(r).split(" ").filter((w) => w.length > 4);
    const hits = words.filter((w) => jd.includes(w)).length;
    return words.length > 0 && hits / words.length >= 0.4;
  }).length;
  const respOverlap = responsibilities.length ? respHits / responsibilities.length : 0.5;

  const roleFit = 25 * (0.7 * relWeight + 0.3 * respOverlap);

  /* ---------- skills (25) ---------- */

  const jobSkills = detect(jd, SKILLS);
  const cvSkills = new Set(detect(cv, SKILLS));
  const matchedSkills = jobSkills.filter((s) => cvSkills.has(s));
  const skillRatio = jobSkills.length ? matchedSkills.length / jobSkills.length : 0.5;
  const skills = 25 * skillRatio;

  /* ---------- experience (15) ---------- */

  const required = parseRequiredYears(jd);
  const have = profile.yearsExperience ?? 0;
  let expRatio: number;
  if (required === undefined) expRatio = 0.75;
  else if (required === 0) expRatio = 1;
  else expRatio = clamp01(have / required);
  const experience = 15 * expRatio;

  /* ---------- industry (10) ---------- */

  const jobDomains = detect(jd, DOMAINS);
  const cvDomains = new Set(detect(cv, DOMAINS));
  const domainHits = jobDomains.filter((d) => cvDomains.has(d));
  const industry = 10 * (jobDomains.length ? domainHits.length / jobDomains.length : 0.5);

  /* ---------- location (10) ---------- */

  let location: number;
  if (jobIsRemote) location = 10;
  else if (cityHit) location = 10;
  else location = 0;

  /* ---------- ownership (10) ---------- */

  const jdOwnership = OWNERSHIP_SIGNALS.filter((s) => has(jd, s));
  const cvOwnership = OWNERSHIP_SIGNALS.filter((s) => has(cv, s));
  const ownRatio = jdOwnership.length
    ? cvOwnership.length / jdOwnership.length
    : 0.5;
  const ownership = 10 * clamp01(ownRatio);

  /* ---------- compensation (5) ---------- */

  const salary = parseSalaryLpa(jd);
  let compensation: number;
  if (salary === undefined || preferences.minSalaryLpa === undefined) compensation = 3;
  else compensation = salary >= preferences.minSalaryLpa ? 5 : 5 * clamp01(salary / preferences.minSalaryLpa);

  /* ---------- total ---------- */

  const breakdown: ScoreBreakdown = {
    roleFit: round(roleFit),
    skills: round(skills),
    experience: round(experience),
    industry: round(industry),
    location: round(location),
    ownership: round(ownership),
    compensation: round(compensation),
  };

  const total = round(
    breakdown.roleFit + breakdown.skills + breakdown.experience +
    breakdown.industry + breakdown.location + breakdown.ownership +
    breakdown.compensation,
  );

  const missing = [
    ...(jobRole?.gaps ?? []),
    ...jobSkills.filter((s) => !cvSkills.has(s)).slice(0, 6),
  ];

  return {
    total,
    breakdown,
    hardFilter,
    relationship,
    missing: [...new Set(missing)],
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
