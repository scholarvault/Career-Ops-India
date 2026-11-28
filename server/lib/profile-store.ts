// The master resume and the target role, kept on disk so the console, the
// workspace and an MCP client all work from the same copy.
//
// Before this, the resume lived in one browser's localStorage: Claude could
// not see it, and a second browser started from nothing. One small JSON file
// fixes that. It is local-only and never leaves the machine.
//
//   data/profile.json  { role, years, details, updatedAt }
//   data/resume.json   { text, file, savedAt }

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ContactDetails = {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  country?: string;
  linkedin?: string;
  website?: string;
  currentCompany?: string;
  currentTitle?: string;
  currentCtc?: string;
  expectedCtc?: string;
  noticePeriod?: string;
  preferredWorkMode?: string;
  willingToRelocate?: string;
  workAuthorization?: string;
  preferredLocality?: string;
  institution?: string;
};

export type TargetProfile = {
  role: string;
  years?: number | string;
  details: ContactDetails;
  updatedAt: string;
};

export type MasterResume = {
  text: string;
  file?: string;
  savedAt: string;
};

const profileFile = (root: string) => join(root, "data", "profile.json");
const resumeFile = (root: string) => join(root, "data", "resume.json");

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

export async function getProfile(root: string): Promise<TargetProfile> {
  const p = await readJson<TargetProfile>(profileFile(root));
  return {
    role: String(p?.role || ""),
    ...(p?.years !== undefined ? { years: p.years } : {}),
    details: p?.details && typeof p.details === "object" ? p.details : {},
    updatedAt: String(p?.updatedAt || ""),
  };
}

export async function saveProfile(
  root: string,
  patch: Partial<Omit<TargetProfile, "updatedAt">>
): Promise<TargetProfile> {
  const prev = await getProfile(root);
  const next: TargetProfile = {
    role: patch.role !== undefined ? String(patch.role) : prev.role,
    ...(patch.years !== undefined ? { years: patch.years } : prev.years !== undefined ? { years: prev.years } : {}),
    details: { ...prev.details, ...(patch.details ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  await writeJson(profileFile(root), next);
  return next;
}

export async function getResume(root: string): Promise<MasterResume | null> {
  const r = await readJson<MasterResume>(resumeFile(root));
  if (!r || !r.text) return null;
  return { text: String(r.text), ...(r.file ? { file: String(r.file) } : {}), savedAt: String(r.savedAt || "") };
}

export async function saveResume(
  root: string,
  text: string,
  file?: string
): Promise<MasterResume> {
  const rec: MasterResume = {
    text: String(text || "").slice(0, 120_000),
    ...(file ? { file: String(file) } : {}),
    savedAt: new Date().toISOString(),
  };
  await writeJson(resumeFile(root), rec);
  return rec;
}
