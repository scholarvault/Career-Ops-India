// Application audit log and daily cap.
//
// Every competitor that asks for trust shows the same two things: a record of
// what was actually submitted, and a hard limit on how much can happen in a
// day. Both are cheap to build and impossible to fake, so they are here.
//
// The log is append-only JSONL on disk. Nothing is sent anywhere.

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type AuditEntry = {
  at: string;
  jobId: string;
  title: string;
  company: string;
  source: string;
  /** Which resume variant was attached, when one was. */
  resume?: string;
  ok: boolean;
  message?: string;
  /** "api" or "browser" — how the application was actually sent. */
  via: "api" | "browser" | "manual";
};

export type CapState = {
  used: number;
  cap: number;
  remaining: number;
  /** True when the cap is reached and a new apply must be refused. */
  blocked: boolean;
};

const DEFAULT_CAP = 25;

function logPath(dataDir: string): string {
  return join(dataDir, "audit.jsonl");
}

/** The cap is a setting first, an env var second, 25 third. */
export function dailyCap(): number {
  const raw = process.env.CAREER_OPS_DAILY_CAP;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULT_CAP;
}

/** IST day key, because the user's day is the one that matters. */
function dayKey(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export async function readAudit(dataDir: string, limit = 500): Promise<AuditEntry[]> {
  let raw = "";
  try {
    raw = await readFile(logPath(dataDir), "utf8");
  } catch {
    return [];
  }
  const out: AuditEntry[] = [];
  for (const line of raw.replace(/^\uFEFF/, "").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as AuditEntry);
    } catch {
      /* a half-written line is skipped, never fatal */
    }
  }
  return out.slice(-limit).reverse();
}

export async function recordApply(dataDir: string, entry: Omit<AuditEntry, "at">): Promise<AuditEntry> {
  const full: AuditEntry = { at: new Date().toISOString(), ...entry };
  await mkdir(dirname(logPath(dataDir)), { recursive: true });
  await appendFile(logPath(dataDir), JSON.stringify(full) + "\n", "utf8");
  return full;
}

/**
 * Count today's *successful* applications. A failed attempt is logged but does
 * not consume the cap — otherwise a broken selector would burn the day.
 */
export async function capState(dataDir: string): Promise<CapState> {
  const cap = dailyCap();
  const today = dayKey(new Date());
  const entries = await readAudit(dataDir, 2000);
  const used = entries.filter((e) => e.ok && dayKey(new Date(e.at)) === today).length;
  const remaining = Math.max(0, cap - used);
  return { used, cap, remaining, blocked: remaining === 0 };
}

/** Refuse before doing any work, so a blocked run never opens a browser. */
export async function assertCanApply(dataDir: string): Promise<CapState> {
  const state = await capState(dataDir);
  if (state.blocked) {
    throw new Error(
      `Daily cap reached (${state.used}/${state.cap}). Raise CAREER_OPS_DAILY_CAP or wait until tomorrow.`,
    );
  }
  return state;
}
