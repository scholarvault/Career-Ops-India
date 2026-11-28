/**
 * Lightweight Agent-Native Shared Action Layer for Career-Ops India.
 * Mirrors @agent-native/core's defineAction + needsApproval argument-hash
 * challenge contract so MCP, HTTP, and CLI callers share one source of truth.
 */

import { createHash } from "node:crypto";
import { chooseResumeStrategy, type SituationalInput } from "./situational";
import { appendLearning, readAppState, readLearnings, writeAppState, type AppScreenState } from "./app-state";

export type SchemaParser<T> = {
  parse: (raw: unknown) => T;
};

export interface ActionDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: SchemaParser<TInput>;
  readOnly?: boolean;
  needsApproval?: boolean | ((input: TInput) => boolean);
  run: (input: TInput, ctx: { dataDir: string }) => Promise<TOutput>;
}

export type ApprovalChallenge = {
  ok: false;
  errorCode: "approval_required";
  action: string;
  argumentsHash: string;
  summary: string;
  hint: string;
};

/** Computes a stable sha256 digest over parsed action arguments so approval binds strictly to reviewed params. */
export function hashActionArgs(name: string, parsedArgs: unknown): string {
  const obj = (parsedArgs && typeof parsedArgs === "object" ? parsedArgs : {}) as Record<string, unknown>;
  const sorted = Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  return createHash("sha256").update(`${name}:${JSON.stringify(sorted)}`).digest("hex").slice(0, 16);
}

/** Executes any shared action, enforcing schema validation and needsApproval binding when required. */
export async function executeAction<TInput, TOutput>(
  action: ActionDefinition<TInput, TOutput>,
  rawInput: unknown,
  ctx: { dataDir: string; approved?: boolean; approvalArgumentsHash?: string },
): Promise<TOutput | ApprovalChallenge> {
  const parsed = action.schema.parse(rawInput ?? {});
  const needsGate =
    typeof action.needsApproval === "function"
      ? action.needsApproval(parsed)
      : Boolean(action.needsApproval);

  if (needsGate) {
    const hash = hashActionArgs(action.name, parsed);
    if (!ctx.approved || (ctx.approvalArgumentsHash && ctx.approvalArgumentsHash !== hash)) {
      return {
        ok: false,
        errorCode: "approval_required",
        action: action.name,
        argumentsHash: hash,
        summary: `Action "${action.name}" requires explicit human approval for hash ${hash}.`,
        hint: "Present the exact job details and resume mode to the user, then re-invoke with approved=true and matching approvalArgumentsHash.",
      };
    }
  }

  return action.run(parsed, ctx);
}

function asObj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function reqStr(v: unknown, field: string): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required string field: ${field}`);
  return s;
}

export const viewScreenAction: ActionDefinition<Record<string, never>> = {
  name: "view_screen",
  description: "Read shared UI navigation/selection state and recent portal learnings so the agent sees what the user sees.",
  readOnly: true,
  schema: { parse: () => ({}) },
  async run(_input, ctx) {
    const state = await readAppState(ctx.dataDir);
    const learnings = await readLearnings(ctx.dataDir, 15);
    return { ok: true, state, recentLearnings: learnings };
  },
};

export const navigateAction: ActionDefinition<Partial<AppScreenState>> = {
  name: "navigate",
  description: "Sync active UI view, highlighted job ID, or selected resume strategy cleanly to data/app-state.json.",
  schema: {
    parse(raw) {
      const o = asObj(raw);
      const strategy = o.resumeStrategy === "original" || o.resumeStrategy === "tailored" || o.resumeStrategy === "auto" ? o.resumeStrategy : undefined;
      return {
        ...(typeof o.view === "string" ? { view: o.view } : {}),
        ...(typeof o.activeJobId === "string" ? { activeJobId: o.activeJobId } : {}),
        ...(Array.isArray(o.selectedJobIds) ? { selectedJobIds: o.selectedJobIds.map(String) } : {}),
        ...(strategy ? { resumeStrategy: strategy } : {}),
        ...(typeof o.filter === "string" ? { filter: o.filter } : {}),
      };
    },
  },
  async run(input, ctx) {
    const state = await writeAppState(ctx.dataDir, input);
    return { ok: true, state };
  },
};

export const chooseResumeStrategyAction: ActionDefinition<SituationalInput> = {
  name: "choose_resume_strategy",
  description: "Situational awareness check: decide whether to keep original Master Resume, tailor with AI, or skip/review manually.",
  readOnly: true,
  schema: {
    parse(raw) {
      const o = asObj(raw);
      const score = Number(o.score ?? 0);
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("score must be 0..100");
      return {
        title: reqStr(o.title, "title"),
        company: reqStr(o.company, "company"),
        jd: typeof o.jd === "string" ? o.jd : "",
        score,
        ...(typeof o.candidateYears === "number" ? { candidateYears: o.candidateYears } : {}),
        ...(typeof o.candidateText === "string" ? { candidateText: o.candidateText } : {}),
        ...(Array.isArray(o.miss) ? { miss: o.miss.map(String) } : {}),
        ...(Array.isArray(o.have) ? { have: o.have.map(String) } : {}),
      };
    },
  },
  async run(input) {
    return { ok: true, ...chooseResumeStrategy(input) };
  },
};

export const recordLearningAction: ActionDefinition<{ area: string; summary: string; detail?: string }> = {
  name: "record_learning",
  description: "Append a non-secret site/application insight to data/LEARNINGS.md for future sessions.",
  schema: {
    parse(raw) {
      const o = asObj(raw);
      return {
        area: reqStr(o.area, "area"),
        summary: reqStr(o.summary, "summary"),
        ...(typeof o.detail === "string" && o.detail.trim() ? { detail: o.detail.trim() } : {}),
      };
    },
  },
  async run(input, ctx) {
    return appendLearning(ctx.dataDir, input);
  },
};

export type PrepareSubmitInput = {
  jobId: string;
  company: string;
  title: string;
  resumeMode: "original" | "tailored";
  noticePeriod: string;
  expectedCtc: string;
  channel?: string;
};

export const prepareSubmitAction: ActionDefinition<PrepareSubmitInput> = {
  name: "prepare_submit",
  description: "Stage a specific application payload and require explicit hash-bound human approval before dispatch.",
  needsApproval: true,
  schema: {
    parse(raw) {
      const o = asObj(raw);
      const resumeMode = o.resumeMode === "original" || o.resumeMode === "tailored" ? o.resumeMode : null;
      if (!resumeMode) throw new Error("resumeMode must be 'original' or 'tailored'");
      return {
        jobId: reqStr(o.jobId, "jobId"),
        company: reqStr(o.company, "company"),
        title: reqStr(o.title, "title"),
        resumeMode,
        noticePeriod: reqStr(o.noticePeriod, "noticePeriod"),
        expectedCtc: reqStr(o.expectedCtc, "expectedCtc"),
        ...(typeof o.channel === "string" && o.channel.trim() ? { channel: o.channel.trim() } : {}),
      };
    },
  },
  async run(input, ctx) {
    await writeAppState(ctx.dataDir, { activeJobId: input.jobId, view: "apply", resumeStrategy: input.resumeMode });
    return {
      ok: true,
      approved: true,
      stagedJob: input,
      readyForRunner: true,
      note: "Explicitly approved for final fill/submit runner.",
    };
  },
};

export const SHARED_ACTIONS = {
  view_screen: viewScreenAction,
  navigate: navigateAction,
  choose_resume_strategy: chooseResumeStrategyAction,
  record_learning: recordLearningAction,
  prepare_submit: prepareSubmitAction,
} as const;
