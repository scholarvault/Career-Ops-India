/**
 * Shared Agent-Native Application State + Durable Learnings Log.
 * Keeps UI navigation/selection visible to MCP/CLI agents and records
 * per-portal learnings to data/LEARNINGS.md without exposing secrets.
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type AppScreenState = {
  view?: string;
  activeJobId?: string;
  selectedJobIds?: string[];
  resumeStrategy?: "original" | "tailored" | "auto";
  filter?: string;
  updatedAt: string;
};

const STATE_FILE = "app-state.json";
const LEARNINGS_FILE = "LEARNINGS.md";

/** Reads shared UI/agent navigation & selection state from data/app-state.json. */
export async function readAppState(dataDir: string): Promise<AppScreenState> {
  try {
    const raw = await readFile(join(dataDir, STATE_FILE), "utf8");
    return JSON.parse(raw) as AppScreenState;
  } catch {
    return { view: "connect", updatedAt: new Date(0).toISOString() };
  }
}

/** Updates partial screen/selection state cleanly for both UI and agent callers. */
export async function writeAppState(
  dataDir: string,
  patch: Partial<AppScreenState>,
): Promise<AppScreenState> {
  await mkdir(dataDir, { recursive: true });
  const prev = await readAppState(dataDir);
  const next: AppScreenState = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(join(dataDir, STATE_FILE), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Appends a sanitized operational takeaway to data/LEARNINGS.md. */
export async function appendLearning(
  dataDir: string,
  entry: { area: string; summary: string; detail?: string },
): Promise<{ ok: true; path: string }> {
  await mkdir(dataDir, { recursive: true });
  const filePath = join(dataDir, LEARNINGS_FILE);
  const ts = new Date().toISOString();
  const cleanArea = entry.area.replace(/[\r\n]+/g, " ").trim();
  const cleanSummary = entry.summary.replace(/[\r\n]+/g, " ").trim();
  const cleanDetail = entry.detail ? ` — ${entry.detail.replace(/[\r\n]+/g, " ").trim()}` : "";
  const line = `- [${ts}] **${cleanArea}**: ${cleanSummary}${cleanDetail}\n`;
  await appendFile(filePath, line, "utf8");
  return { ok: true, path: filePath };
}

/** Reads recent durable learnings for agent context grounding. */
export async function readLearnings(dataDir: string, maxLines = 40): Promise<string[]> {
  try {
    const raw = await readFile(join(dataDir, LEARNINGS_FILE), "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().startsWith("- "));
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}
