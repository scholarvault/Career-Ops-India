// Per-site memory: what each site asks, how it signs you in, and the answers
// the user gave.
//
// This is the "you will learn every form" half of auto apply. The form cache
// (formcache.ts) remembers field *shapes* so a second apply skips discovery.
// This file remembers the *flow* and the *answers*, so the agent can say
// "Indeed: email + OTP, 12 fields, notice period 30" instead of asking again.
//
// Sensitive answers (CTC, notice period, "why this role") are stored only
// because the user typed them. They are offered on a new form, never filled
// silently: the console shows the saved answer and the user confirms it.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SiteFlow = "email-otp" | "mobile-otp" | "none" | "login" | "unknown";

export type SiteField = {
  key: string;
  label: string;
  selector: string;
  type: string;
  lastValue?: string;
};

export type SiteRecord = {
  host: string;
  flow: SiteFlow;
  fields: SiteField[];
  answers: Record<string, string>;
  lastUsed?: string;
  successCount: number;
  failCount: number;
  notes?: string;
};

type Store = Record<string, SiteRecord>;

const file = (dataDir: string) => join(dataDir, "sites.json");

async function readStore(dataDir: string): Promise<Store> {
  try {
    const raw = await readFile(file(dataDir), "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(dataDir: string, store: Store): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(file(dataDir), JSON.stringify(store, null, 2), "utf8");
}

/**
 * A stable key for a field label, so "Notice Period", "Notice period (days)"
 * and "How soon can you join?" all land on the same answer.
 */
export function keyFor(label: string): string {
  const l = String(label || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!l) return "unknown";
  if (/\be-?mail\b/.test(l)) return "email";
  if (/\b(phone|mobile|contact number)\b/.test(l)) return "phone";
  if (/\b(first name|given name)\b/.test(l)) return "first_name";
  if (/\b(last name|surname|family name)\b/.test(l)) return "last_name";
  if (/\b(full name|your name|^name$)\b/.test(l)) return "full_name";
  if (/\bnotice period|how soon can you join|joining time\b/.test(l)) return "notice_period";
  if (/\bexpected\s*(ctc|salary|compensation)\b/.test(l)) return "expected_ctc";
  if (/\bcurrent\s*(ctc|salary|compensation)\b/.test(l)) return "current_ctc";
  if (/\bwhy (this|the) (role|job|company)|cover letter|motivation\b/.test(l)) return "why_role";
  if (/\blinkedin\b/.test(l)) return "linkedin";
  if (/\b(github|portfolio|website|personal site)\b/.test(l)) return "website";
  if (/\b(country|nation)\b/.test(l) && !/\b(code|dial|phone|authori[sz]ed|eligible|citizen)\b/.test(l)) return "country";
  if (/\b(state|province|region)\b/.test(l) && !/\b(statement|status|relocat)\b/.test(l)) return "state";
  if (/\b(pin\s*code|postal\s*code|zip\s*code|pincode)\b/.test(l)) return "postal_code";
  if (/\b(city|location|where are you based)\b/.test(l)) return "city";
  if (/\b(years|total experience)\b/.test(l)) return "years";
  if (/\b(current|present) (company|employer)\b/.test(l)) return "current_company";
  if (/\b(current|present) (title|role|designation)\b/.test(l)) return "current_title";
  if (/\b(degree|qualification|education)\b/.test(l)) return "education";
  if (/\b(authori[sz]ed|work permit|visa)\b/.test(l)) return "work_authorisation";
  return l.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "unknown";
}

export async function listSites(dataDir: string): Promise<SiteRecord[]> {
  const store = await readStore(dataDir);
  return Object.values(store).sort((a, b) =>
    String(b.lastUsed || "").localeCompare(String(a.lastUsed || ""))
  );
}

export async function getSite(dataDir: string, host: string): Promise<SiteRecord | null> {
  if (!host) return null;
  const store = await readStore(dataDir);
  return store[host] ?? null;
}

export async function putSite(dataDir: string, rec: SiteRecord): Promise<void> {
  if (!rec.host) return;
  const store = await readStore(dataDir);
  store[rec.host] = rec;
  await writeStore(dataDir, store);
}

/** Create or update a site, merging fields and answers. */
export async function touchSite(
  dataDir: string,
  host: string,
  patch: Partial<Omit<SiteRecord, "host">>
): Promise<SiteRecord> {
  const store = await readStore(dataDir);
  const prev: SiteRecord =
    store[host] ?? { host, flow: "unknown", fields: [], answers: {}, successCount: 0, failCount: 0 };
  const next: SiteRecord = {
    ...prev,
    ...patch,
    host,
    fields: patch.fields ?? prev.fields,
    answers: { ...prev.answers, ...(patch.answers ?? {}) },
    lastUsed: new Date().toISOString(),
  };
  store[host] = next;
  await writeStore(dataDir, store);
  return next;
}

export async function recordAnswer(
  dataDir: string,
  host: string,
  key: string,
  value: string
): Promise<void> {
  if (!host || !key || !value) return;
  await touchSite(dataDir, host, { answers: { [key]: value } });
}

export async function recordOutcome(
  dataDir: string,
  host: string,
  ok: boolean
): Promise<void> {
  if (!host) return;
  const store = await readStore(dataDir);
  const prev: SiteRecord =
    store[host] ?? { host, flow: "unknown", fields: [], answers: {}, successCount: 0, failCount: 0 };
  prev.successCount += ok ? 1 : 0;
  prev.failCount += ok ? 0 : 1;
  prev.lastUsed = new Date().toISOString();
  store[host] = prev;
  await writeStore(dataDir, store);
}

export async function forgetSite(dataDir: string, host: string): Promise<boolean> {
  const store = await readStore(dataDir);
  if (!(host in store)) return false;
  delete store[host];
  await writeStore(dataDir, store);
  return true;
}

const PORTABLE_KEYS = new Set([
  "country",
  "state",
  "postal_code",
  "city",
  "years",
  "education",
  "work_authorisation",
  "willing_to_relocate",
]);

/** Look up an answer on this host first, then safe non-sensitive geographic/profile keys taught on other sites. */
export async function lookupAnswer(
  dataDir: string,
  host: string,
  key: string
): Promise<{ value: string; crossSite: boolean } | null> {
  const store = await readStore(dataDir);
  const exact = store[host]?.answers?.[key];
  if (exact) return { value: exact, crossSite: false };
  if (!PORTABLE_KEYS.has(key)) return null;
  for (const rec of Object.values(store)) {
    if (rec.host === host) continue;
    const v = rec.answers?.[key];
    if (v) return { value: v, crossSite: true };
  }
  return null;
}

/** Infer the sign-in flow from what the page did. */
export function flowFrom(host: string, sawOtp: boolean, sawPassword: boolean): SiteFlow {
  if (sawPassword) return "login";
  if (sawOtp) return /naukri|indeed/i.test(host) ? "mobile-otp" : "email-otp";
  return "none";
}
