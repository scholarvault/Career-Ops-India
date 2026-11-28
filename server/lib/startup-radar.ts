/**
 * Startup Radar & Self-Learning Company Index.
 * Combines 2026 emerging role categories, Indian Startup/Funding intelligence channels,
 * ATS slug probing (Lever / Greenhouse / Ashby / SmartRecruiters / Workable),
 * and local index metadata (data/company-index.json + data/LEARNINGS.md).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type JobCategoryId =
  | "zero_to_one_founders"
  | "ai_agentic_product"
  | "product"
  | "gtm_forward_deployed"
  | "operations"
  | "sales_marketing"
  | "finance_finops"
  | "engineering_data"
  | "c_suite";

export interface JobCategoryDef {
  id: JobCategoryId;
  label: string;
  tier: "emerging" | "core" | "executive";
  sampleTitles: string[];
  keywords: RegExp;
}

export const JOB_CATEGORIES: JobCategoryDef[] = [
  {
    id: "zero_to_one_founders",
    label: "0→1 Builder & Founder's Office",
    tier: "emerging",
    sampleTitles: ["Founder's Office", "Chief of Staff", "0→1 Builder", "Entrepreneur in Residence (EIR)", "Co-Founder (Product/Ops)"],
    keywords: /\b(founder'?s?\s*office|chief\s*of\s*staff|0\s*(?:to|->|→)\s*1|zero\s*to\s*one|eir|entrepreneur\s+in\s+residence|co-?founder|founding)\b/i,
  },
  {
    id: "ai_agentic_product",
    label: "AI Product & Agentic Workflows",
    tier: "emerging",
    sampleTitles: ["AI Product Manager", "AI Operations & Evals Lead", "Agentic Workflow Architect", "AI Transformation Lead"],
    keywords: /\b(ai\s+product|genai\s+product|llm\s+product|agentic|mcp|ai\s+ops|ai\s+architect|ai\s+eval)\b/i,
  },
  {
    id: "gtm_forward_deployed",
    label: "GTM Engineering & Forward-Deployed",
    tier: "emerging",
    sampleTitles: ["Forward Deployed PM", "Forward Deployed Engineer (FDE)", "GTM Engineer", "AI RevOps Lead"],
    keywords: /\b(forward[\s-]deployed|gtm\s+engineer|revenue\s+operations|revops|growth\s+engineer|solutions\s+architect)\b/i,
  },
  {
    id: "product",
    label: "Product Management & Strategy",
    tier: "core",
    sampleTitles: ["Product Manager", "Senior Product Manager", "Platform PM", "Product Operations", "Product Growth"],
    keywords: /\b(product\s+manager|product\s+lead|product\s+owner|product\s+operations|product\s+strategy|product\s+marketing)\b/i,
  },
  {
    id: "sales_marketing",
    label: "Sales, Growth & Marketing",
    tier: "core",
    sampleTitles: ["Enterprise AE", "Growth Marketing Lead", "SEO/AEO Lead", "Partnerships & Alliances"],
    keywords: /\b(sales|marketing|account\s+executive|business\s+development|partnerships|demand\s+gen|seo|growth)\b/i,
  },
  {
    id: "operations",
    label: "Operations, Supply Chain & EV Ops",
    tier: "core",
    sampleTitles: ["Operations Lead", "Supply Chain & NPI", "EV Fleet Operations", "Marketplace Ops"],
    keywords: /\b(operations|supply\s+chain|logistics|fleet|procurement|fulfillment)\b/i,
  },
  {
    id: "finance_finops",
    label: "Finance, Accounting & AI FinOps",
    tier: "core",
    sampleTitles: ["Strategic Finance", "FP&A Lead", "AI FinOps Analyst", "Controller / Chartered Accountant"],
    keywords: /\b(finance|accounting|fp&a|finops|controller|treasury|chartered\s+accountant)\b/i,
  },
  {
    id: "engineering_data",
    label: "Engineering, Data & Cloud",
    tier: "core",
    sampleTitles: ["Full-Stack Engineer", "ML / LLM Engineer", "Data Engineer", "Platform Architect"],
    keywords: /\b(software\s+engineer|full[\s-]stack|backend|frontend|ml\s+engineer|data\s+scientist|devops)\b/i,
  },
  {
    id: "c_suite",
    label: "C-Suite & Executive Leadership",
    tier: "executive",
    sampleTitles: ["VP Product", "CPO / Head of Product", "COO", "VP Operations", "CTO"],
    keywords: /\b(ceo|coo|cpo|cto|cfo|vp\s+of|vice\s+president|head\s+of\s+product|director\s+of\s+product)\b/i,
  },
];

export type StartupSeed = {
  company: string;
  city: string;
  sector: "fintech" | "ev-automotive" | "ai-saas" | "fortune500" | "enterprise-saas";
  source: "yc-india" | "funded-startup" | "fortune500" | "ats-public";
  careersUrl: string;
  atsKind?: "lever" | "greenhouse" | "ashby" | "smartrecruiters" | "workable" | "custom";
  atsSlug?: string;
  notes?: string;
};

export const STARTUP_RADAR_SEEDS: StartupSeed[] = [
  // Chennai & Tamil Nadu SaaS / EV / Enterprise
  { company: "Raptee.HV", city: "Chennai", sector: "ev-automotive", source: "funded-startup", careersUrl: "https://rapteehv.com/careers", atsKind: "custom", notes: "High-voltage electric motorcycles (T30), Chennai R&D & ops" },
  { company: "Freshworks", city: "Chennai", sector: "enterprise-saas", source: "ats-public", careersUrl: "https://careers.freshworks.com", atsKind: "smartrecruiters", atsSlug: "Freshworks" },
  { company: "Tekion", city: "Chennai / Bengaluru", sector: "ev-automotive", source: "funded-startup", careersUrl: "https://jobs.ashbyhq.com/tekion", atsKind: "ashby", atsSlug: "tekion", notes: "Automotive retail cloud platform" },
  { company: "SuperOps", city: "Chennai", sector: "ai-saas", source: "funded-startup", careersUrl: "https://superops.com/careers", atsKind: "custom" },
  { company: "Chargebee", city: "Chennai", sector: "fintech", source: "funded-startup", careersUrl: "https://www.chargebee.com/careers/", atsKind: "custom" },
  { company: "ValGenesis", city: "Chennai", sector: "enterprise-saas", source: "ats-public", careersUrl: "https://jobs.lever.co/valgenesis", atsKind: "lever", atsSlug: "valgenesis" },
  // Bengaluru EV Automotive & YC / Funded AI + Fintech
  { company: "Ather Energy", city: "Bengaluru / South India", sector: "ev-automotive", source: "funded-startup", careersUrl: "https://www.atherenergy.com/careers", atsKind: "custom", notes: "Founders' Office (CoS) & Software PM hiring" },
  { company: "River Mobility", city: "Bengaluru", sector: "ev-automotive", source: "funded-startup", careersUrl: "https://www.rideriver.com", atsKind: "custom", notes: "River Indie e-scooter ($120M Series C)" },
  { company: "Simple Energy", city: "Bengaluru / Hosur (TN border)", sector: "ev-automotive", source: "funded-startup", careersUrl: "https://www.simpleenergy.in/careers", atsKind: "custom" },
  { company: "Razorpay", city: "Bengaluru", sector: "fintech", source: "yc-india", careersUrl: "https://job-boards.greenhouse.io/razorpaysoftwareprivatelimited", atsKind: "greenhouse", atsSlug: "razorpaysoftwareprivatelimited", notes: "YC W2015 · Active PM II / SPM / Staff PM / Strategy" },
  { company: "Composio", city: "Bengaluru", sector: "ai-saas", source: "yc-india", careersUrl: "https://jobs.ashbyhq.com/composio", atsKind: "ashby", atsSlug: "composio", notes: "YC AI Agent infrastructure" },
  { company: "Sarvam AI", city: "Bengaluru / Chennai", sector: "ai-saas", source: "funded-startup", careersUrl: "https://jobs.ashbyhq.com/sarvam", atsKind: "ashby", atsSlug: "sarvam" },
  { company: "CRED", city: "Bengaluru", sector: "fintech", source: "funded-startup", careersUrl: "https://jobs.lever.co/cred", atsKind: "lever", atsSlug: "cred" },
  { company: "Paytm", city: "Bengaluru / Noida", sector: "fintech", source: "ats-public", careersUrl: "https://jobs.lever.co/paytm", atsKind: "lever", atsSlug: "paytm" },
  { company: "Groww", city: "Bengaluru", sector: "fintech", source: "yc-india", careersUrl: "https://boards.greenhouse.io/groww", atsKind: "greenhouse", atsSlug: "groww" },
  { company: "Zeta", city: "Bengaluru / Remote", sector: "fintech", source: "funded-startup", careersUrl: "https://jobs.lever.co/zeta", atsKind: "lever", atsSlug: "zeta" },
  // Fortune 500 & Top Global India
  { company: "Amazon India", city: "Chennai / Bengaluru", sector: "fortune500", source: "fortune500", careersUrl: "https://www.amazon.jobs", atsKind: "custom" },
  { company: "EPAM Systems", city: "Chennai / Bengaluru", sector: "fortune500", source: "fortune500", careersUrl: "https://careers.epam.com", atsKind: "custom" },
  { company: "Tesla", city: "Remote / India", sector: "fortune500", source: "fortune500", careersUrl: "https://www.tesla.com/careers", atsKind: "custom" },
];

/** Classifies a job title/JD into one of the expanded 2026 Indian role categories. */
export function categorizeRole(title: string, jd = ""): JobCategoryDef {
  const hay = `${title}\n${jd.slice(0, 600)}`;
  for (const cat of JOB_CATEGORIES) {
    if (cat.keywords.test(hay)) return cat;
  }
  return JOB_CATEGORIES.find((c) => c.id === "product")!;
}

/** Reads or initializes the local self-learning startup & ATS slug index in data/company-index.json. */
export async function syncStartupIndex(dataDir: string): Promise<{ count: number; updatedAt: string }> {
  await mkdir(dataDir, { recursive: true });
  const file = join(dataDir, "company-index.json");
  let existing: StartupSeed[] = [];
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (Array.isArray(parsed.companies)) existing = parsed.companies;
  } catch {
    /* cold start */
  }
  const map = new Map<string, StartupSeed>();
  for (const c of [...STARTUP_RADAR_SEEDS, ...existing]) {
    map.set(c.company.toLowerCase(), c);
  }
  const merged = [...map.values()];
  const updatedAt = new Date().toISOString();
  await writeFile(file, JSON.stringify({ updatedAt, companies: merged }, null, 2), "utf8");
  return { count: merged.length, updatedAt };
}
