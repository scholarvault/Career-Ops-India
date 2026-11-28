#!/usr/bin/env node
// Career-Ops India — MCP server (stdio).
//
// Exposes the same discovery and scoring the web app uses, so Claude Desktop,
// Cursor, or any MCP client can search Indian postings, score a CV against a
// job, and build an application plan.
//
// Register it in an MCP client with:
//   command: node
//   args: ["--import", "tsx", "server/mcp.ts"]
//   cwd: <this repo>
//
// It speaks newline-delimited JSON-RPC 2.0 on stdin/stdout. Nothing is written
// to stdout except protocol messages; logs go to stderr.

import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { scoreJob } from "@career-ops/career-scoring";
import { planApplication, canSubmit, type DetectedField } from "@career-ops/application-agent";
import type { Job, Profile } from "@career-ops/contracts";
import {
  BOARDS,
  discoverJobs,
  prefsFor,
  profileFor,
  type JobRequest,
  type ScoredJob,
} from "./lib/discovery";
import { marketSummary } from "./lib/market";
import { forgetSite, listSites } from "./lib/sites";
import { getProfile, getResume, saveProfile, saveResume } from "./lib/profile-store";
import { chooseResumeStrategy } from "./lib/situational";
import { SHARED_ACTIONS, executeAction } from "./lib/actions";
import { JOB_CATEGORIES, STARTUP_RADAR_SEEDS, syncStartupIndex } from "./lib/startup-radar";
import { PORTAL_AUTH_PROFILES } from "./lib/portal-auth";
import { toAgentChallenge } from "./lib/asks";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PROFILE_DIR = join(ROOT, "data", "browser-profile");
const SECRETS_FILE = join(ROOT, "data", "secrets.json");
const DATA = join(ROOT, "data");

/** The web app owns the apply queue (it holds the browser). Tools that start,
 *  answer or inspect a run talk to it over its own JSON API. */
const SERVER = String(process.env.CAREER_OPS_URL || "http://127.0.0.1:4173").replace(/\/$/, "");

/* An agent should not have to tell the user "run pnpm start first". When the
   app is local and down, start it the same way `pnpm start` does (detached,
   logs in logs/), without popping a window: the agent shows the URL instead.
   A remote CAREER_OPS_URL is never started from here. */
let starting: Promise<boolean> | null = null;
async function ensureServer(): Promise<boolean> {
  const alive = async () => {
    try {
      const r = await fetch(SERVER + "/api/browser/status", { signal: AbortSignal.timeout(2000) });
      return r.status < 500;
    } catch {
      return false;
    }
  };
  if (await alive()) return true;
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SERVER) || process.env.CAREER_OPS_NO_AUTOSTART) return false;
  starting ??= (async () => {
    const { spawn } = await import("node:child_process");
    console.error(`career-ops: app not running, starting it at ${SERVER}`);
    spawn(process.execPath, [join(ROOT, "scripts", "serve.mjs")], {
      cwd: ROOT,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, NO_OPEN: "1" },
    }).unref();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await alive()) return true;
    }
    return false;
  })().finally(() => {
    starting = null;
  });
  return starting;
}

async function serverApi(path: string, body?: unknown, method?: string): Promise<any> {
  let r: Response;
  const call = () =>
    fetch(SERVER + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    r = await call();
  } catch {
    if (!(await ensureServer())) {
      throw new Error(
        `The Career-Ops app is not running at ${SERVER} and could not be started. Run \`pnpm start\` in the repo, then retry.`
      );
    }
    r = await call();
  }
  let d: any = null;
  try {
    d = await r.json();
  } catch {
    throw new Error(`The app answered ${r.status} with no JSON.`);
  }
  return d;
}

/** The MCP server reads the same key file the web app writes, so a key pasted
 *  once on the Connections page also works for a tool call. */
async function sourceKeys() {
  try {
    const s = JSON.parse(await readFile(SECRETS_FILE, "utf8")) as Record<string, string>;
    return {
      adzunaAppId: s.adzunaAppId,
      adzunaAppKey: s.adzunaAppKey,
      joobleKey: s.joobleKey,
      careerjetKey: s.careerjetKey,
      careerjetDataKey: s.careerjetDataKey,
      jsearchKey: s.jsearchKey,
      firecrawlKey: s.firecrawlKey,
      tinyfishKey: s.tinyfishKey,
    };
  } catch {
    return {};
  }
}

export const SERVER_INFO = { name: "career-ops-india", version: "0.3.0" };
export const PROTOCOL = "2024-11-05";
/** Versions this server speaks. Claude Code, Codex and Gemini CLI each send
 *  their newest; answering with the one they asked for (when we support it)
 *  avoids a needless downgrade. Tools-only, so the differences do not touch us. */
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export function negotiateProtocol(requested: unknown): string {
  return typeof requested === "string" && SUPPORTED_PROTOCOLS.includes(requested) ? requested : PROTOCOL;
}

/* ------------------------------------------------------------------ */
/* tools                                                               */
/* ------------------------------------------------------------------ */

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const TOOLS: Tool[] = [
  {
    name: "search_jobs",
    description:
      "Search live Indian job postings. Reads public employer ATS feeds (Lever, Greenhouse, Ashby) and, when asked, Naukri through the local Chrome profile. Returns postings scored 0-100 against the given role and skills, with the matched ones first.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Job title to search for, e.g. 'Business Analyst'." },
        city: { type: "string", description: "Indian city, e.g. 'Chennai'. Optional." },
        cities: { type: "array", items: { type: "string" }, description: "Several cities." },
        skills: { type: "array", items: { type: "string" }, description: "Skills from the CV." },
        years: { type: "number", description: "Years of experience." },
        maxAgeDays: { type: "number", description: "Only return postings newer than N days (e.g. 7, 14, 30)." },
        minSalaryLpa: { type: "number", description: "Minimum stated salary floor in LPA, when disclosed." },
        limit: { type: "number", description: "Max postings to return (default 20)." },
        sources: {
          type: "array",
          items: { type: "string", enum: ["public", "naukri"] },
          description: "Which sources to use. Default: both.",
        },
      },
      required: ["role"],
    },
  },
  {
    name: "score_job",
    description:
      "Score one posting against a candidate profile with the deterministic 100-point engine. Returns the total, the seven-part breakdown, and the missing skills. The model never produces this number.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string" },
        title: { type: "string" },
        company: { type: "string" },
        location: { type: "string" },
        description: { type: "string" },
        skills: { type: "array", items: { type: "string" } },
        years: { type: "number" },
        cities: { type: "array", items: { type: "string" } },
        responsibilities: { type: "array", items: { type: "string" } },
      },
      required: ["role", "title", "description"],
    },
  },
  {
    name: "list_connectors",
    description:
      "List every job source this install can reach, whether it needs a key, and whether it runs in a browser session.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "plan_application",
    description:
      "Build an application plan for one posting: which fields can be filled from the profile, which need the candidate, and whether the approval gate allows submission.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        company: { type: "string" },
        location: { type: "string" },
        description: { type: "string" },
        profile: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            city: { type: "string" },
            years: { type: "number" },
            skills: { type: "array", items: { type: "string" } },
            linkedin: { type: "string" },
          },
        },
        fields: {
          type: "array",
          description: "Form fields detected on the application page.",
          items: {
            type: "object",
            properties: {
              selector: { type: "string" },
              label: { type: "string" },
              name: { type: "string" },
              type: { type: "string" },
              required: { type: "boolean" },
            },
            required: ["selector", "label", "type"],
          },
        },
      },
      required: ["title", "description", "profile", "fields"],
    },
  },
  {
    name: "upload_resume",
    description:
      "Save the master resume text once. The console, the workspace and every later tool read the same copy from data/resume.json. Read the file locally first; send the text, not the binary.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The resume as plain text." },
        file: { type: "string", description: "Original file name, for display." },
      },
      required: ["text"],
    },
  },
  {
    name: "set_target_role",
    description:
      "Set the role the candidate is looking for, plus the contact details forms ask for. Stored in data/profile.json and shared with the console.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Target job title, e.g. 'Product Manager'." },
        years: { type: "number", description: "Years of experience." },
        details: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            city: { type: "string" },
            linkedin: { type: "string" },
            website: { type: "string" },
            currentCompany: { type: "string" },
            currentTitle: { type: "string" },
            currentCtc: { type: "string", description: "Explicit Current CTC (e.g. '10 LPA'). Never guessed." },
            expectedCtc: { type: "string", description: "Explicit Expected CTC (e.g. '15 LPA'). Never guessed." },
            noticePeriod: { type: "string", description: "Explicit Notice Period (e.g. 'Immediate', '30 days'). Never guessed." },
            preferredWorkMode: { type: "string", description: "e.g. 'Any', 'Remote', 'Hybrid', 'Onsite'." },
            willingToRelocate: { type: "string", description: "e.g. 'Yes' or 'No'." },
            preferredLocality: { type: "string", description: "Sub-city locality or corridor, e.g. 'Velachery', 'OMR', 'Whitefield'." },
            workAuthorization: { type: "string", description: "Work eligibility statement, e.g. 'Authorized to work in India'." },
          },
        },
      },
      required: ["role"],
    },
  },
  {
    name: "market_summary",
    description:
      "The funnel for a role: how many postings exist in India, remote, in a state, in a city/locality and in the last 7 days, plus geo heatmap distribution, role families and trending titles.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string" },
        state: { type: "string", description: "Indian state, e.g. 'tamil nadu'." },
        city: { type: "string" },
        locality: { type: "string", description: "Micro-locality / corridor / PIN code, e.g. 'Velachery', 'Guindy', '600042'." },
        remote: { type: "boolean" },
        years: { type: "number" },
        skills: { type: "array", items: { type: "string" } },
        maxAgeDays: { type: "number", description: "Only count/rank postings newer than N days (e.g. 7, 14, 30)." },
        minSalaryLpa: { type: "number", description: "Minimum stated salary floor in LPA." },
        limit: { type: "number", description: "Shortlist size (default 10)." },
      },
      required: ["role"],
    },
  },
  {
    name: "geo_heatmap",
    description:
      "Return the hierarchical India -> State -> City -> Micro-Locality job intensity distribution (including corridors like Velachery, Guindy, OMR, Sriperumbudur, Whitefield) without guessing counts.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", description: "Target role, e.g. 'Product Manager' (optional)." },
        state: { type: "string" },
        city: { type: "string" },
        locality: { type: "string", description: "Specific locality or PIN code to inspect, e.g. 'Velachery'." },
        maxAgeDays: { type: "number", description: "Freshness cutoff in days (default 30)." },
      },
    },
  },
  {
    name: "shortlist",
    description:
      "The best N postings for a role in a geography, scored and sorted. Each entry says which family it belongs to and what it is missing. Use this to choose a batch of 10.",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string" },
        state: { type: "string" },
        city: { type: "string" },
        locality: { type: "string" },
        years: { type: "number" },
        skills: { type: "array", items: { type: "string" } },
        maxAgeDays: { type: "number", description: "Only rank postings newer than N days (e.g. 7, 14, 30)." },
        minSalaryLpa: { type: "number", description: "Minimum stated salary floor in LPA." },
        limit: { type: "number", description: "Default 10." },
      },
      required: ["role"],
    },
  },
  {
    name: "tailor_batch",
    description:
      "Tailor one resume per job and save each PDF with a hash. Needs the master resume and the AI key already set in the app. Returns which jobs are ready to apply.",
    inputSchema: {
      type: "object",
      properties: {
        jobs: {
          type: "array",
          description: "Postings to tailor. Use the objects shortlist returned.",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              company: { type: "string" },
              location: { type: "string" },
              jd: { type: "string" },
              score: { type: "number" },
              have: { type: "array", items: { type: "string" }, description: "Matched skills, from shortlist." },
              miss: { type: "array", items: { type: "string" }, description: "Missing skills, from shortlist. Without have/miss the gaps count as unknown." },
            },
            required: ["id", "title", "company"],
          },
        },
        situational: {
          type: "boolean",
          description: "When true (default), keeps Original PDF for direct/thin matches and skips severe mismatches instead of blind AI rewriting.",
        },
      },
      required: ["jobs"],
    },
  },
  {
    name: "start_apply_batch",
    description:
      "Start applying to a batch in the app's browser. mode 'submit' fills and submits, then verifies a confirmation; mode 'fill' only fills. When a site needs an email, an OTP, an unknown field or a captcha, the run asks and waits: read it with get_apply_status and answer with answer_ask. Never guesses a value.",
    inputSchema: {
      type: "object",
      properties: {
        jobs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              company: { type: "string" },
              source: { type: "string" },
              applyUrl: { type: "string" },
              sourceUrl: { type: "string" },
              score: { type: "number" },
            },
            required: ["id", "title", "company"],
          },
        },
        mode: { type: "string", enum: ["submit", "fill"], description: "Default submit." },
        cap: { type: "number", description: "Daily submission cap. Default 10." },
      },
      required: ["jobs"],
    },
  },
  {
    name: "get_apply_status",
    description:
      "The live queue: every job's status, the confirmation text, and the open question the run is waiting on (ask.id, ask.label, ask.inputType, ask.site). Poll this after start_apply_batch.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "answer_ask",
    description:
      "Answer the open question from get_apply_status. The value is typed into the field the agent asked about and the run continues. For a captcha or a password the value is 'done' after the user clears it in the browser.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ask.id from get_apply_status." },
        value: { type: "string", description: "The answer, or 'done' for a handover." },
      },
      required: ["id", "value"],
    },
  },
  {
    name: "resume_apply_batch",
    description:
      "Put the parked jobs back in line and continue. Use after the user has cleared a captcha or signed in.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_sites",
    description:
      "Every site the agent has learned: its sign-in flow, the fields it asks, the answers the user gave, and how many applications succeeded.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "forget_site",
    description: "Forget everything learned about one site, including the saved answers.",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string", description: "e.g. in.indeed.com" } },
      required: ["host"],
    },
  },
  {
    name: "view_screen",
    description: "Context awareness: read what view/job the user is currently looking at in the UI plus recent portal learnings from data/LEARNINGS.md.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "navigate",
    description: "Move shared UI navigation/selection state (active view, highlighted jobId, or resume strategy).",
    inputSchema: {
      type: "object",
      properties: {
        view: { type: "string" },
        activeJobId: { type: "string" },
        resumeStrategy: { type: "string", enum: ["original", "tailored", "auto"] },
      },
    },
  },
  {
    name: "choose_resume_strategy",
    description: "Situational awareness engine: decide whether to keep Original Master Resume, tailor with AI, or skip/review manually.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        company: { type: "string" },
        jd: { type: "string" },
        score: { type: "number" },
        candidateYears: { type: "number" },
        miss: { type: "array", items: { type: "string" } },
        have: { type: "array", items: { type: "string" } },
      },
      required: ["title", "company", "score"],
    },
  },
  {
    name: "record_learning",
    description: "Append a durable site/application note to data/LEARNINGS.md.",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string" },
        summary: { type: "string" },
        detail: { type: "string" },
      },
      required: ["area", "summary"],
    },
  },
  {
    name: "prepare_submit",
    description: "Hash-bound human approval gate (Agent-Native needsApproval): returns approval_required challenge + argumentsHash until approved=true matches hash.",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        company: { type: "string" },
        title: { type: "string" },
        resumeMode: { type: "string", enum: ["original", "tailored"] },
        noticePeriod: { type: "string" },
        expectedCtc: { type: "string" },
        channel: { type: "string" },
        approved: { type: "boolean" },
        approvalArgumentsHash: { type: "string" },
      },
      required: ["jobId", "company", "title", "resumeMode", "noticePeriod", "expectedCtc"],
    },
  },
  {
    name: "startup_radar",
    description:
      "Return the 9 Indian job categories (including emerging 2026 0-1 Builder, Founder's Office, AI Product & GTM roles), portal auth/dual-redirect protocols, and the self-learning Indian startup index (EV automotive, Fintech, YC India, Fortune 500). Optionally syncs data/company-index.json.",
    inputSchema: {
      type: "object",
      properties: {
        sector: { type: "string", enum: ["fintech", "ev-automotive", "ai-saas", "fortune500", "enterprise-saas"] },
        city: { type: "string", description: "Filter company seeds by city, e.g. 'Chennai' or 'Bengaluru'." },
        sync: { type: "boolean", description: "If true, writes/updates data/company-index.json." },
      },
    },
  },
];

/* ------------------------------------------------------------------ */
/* handlers                                                            */
/* ------------------------------------------------------------------ */

function text(value: unknown) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

export async function callTool(name: string, args: any) {
  if (name === "search_jobs") {
    const req: JobRequest = {
      role: String(args.role ?? ""),
      cities: args.cities ?? (args.city ? [args.city] : undefined),
      skills: args.skills ?? [],
      years: typeof args.years === "number" ? args.years : undefined,
      responsibilities: args.skills ?? [],
      sources: args.sources ?? ["public", "naukri"],
      profileDir: PROFILE_DIR,
      limit: typeof args.limit === "number" ? args.limit : 20,
      ...(typeof args.maxAgeDays === "number" ? { maxAgeDays: args.maxAgeDays } : {}),
      ...(typeof args.minSalaryLpa === "number" ? { minSalaryLpa: args.minSalaryLpa } : {}),
      sourceKeys: await sourceKeys(),
    };
    const result = await discoverJobs(req);
    const limit = typeof args.limit === "number" ? args.limit : 20;
    return text({
      role: req.role,
      total: result.total,
      matched: result.matched,
      connectors: result.connectors,
      jobs: result.jobs.slice(0, limit).map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        location: j.location,
        workMode: j.workMode,
        category: j.category,
        experienceAsked: j.experienceAsked,
        score: j.score,
        matched: j.matched,
        source: j.source,
        sourceUrl: j.sourceUrl,
        applyUrl: j.applyUrl,
        datePosted: j.datePosted,
        ageDays: j.ageDays,
        url: j.sourceUrl,
        missing: j.miss,
      })),
    });
  }

  if (name === "score_job") {
    const job: Job = {
      id: "mcp:job",
      sourceId: "mcp",
      sourceUrl: "https://example.invalid",
      company: String(args.company ?? "Not stated"),
      title: String(args.title),
      location: String(args.location ?? ""),
      country: "IN",
      description: String(args.description),
      firstSeenAt: new Date().toISOString(),
      status: "open",
    };
    const req: JobRequest = {
      role: String(args.role),
      cities: args.cities ?? (args.location ? [String(args.location)] : []),
      skills: args.skills ?? [],
      years: typeof args.years === "number" ? args.years : undefined,
      responsibilities: args.responsibilities ?? args.skills ?? [],
    };
    const s = scoreJob({
      profile: profileFor(req),
      preferences: prefsFor(req),
      job,
      responsibilities: req.responsibilities ?? [],
    });
    return text({
      total: Math.round(s.total * 10) / 10,
      relationship: s.relationship,
      breakdown: s.breakdown,
      missing: s.missing,
      explanation: s.explanation ?? "",
      note: "Deterministic. The same inputs always produce this number.",
    });
  }

  if (name === "list_connectors") {
    return text({
      connectors: [
        ...BOARDS.map((b) => ({
          id: b.id,
          company: b.company,
          kind: b.kind,
          auth: "none",
          note: "Public employer ATS feed. No key, no scraping.",
        })),
        {
          id: "naukri",
          company: "Naukri",
          kind: "browser",
          auth: "user-session",
          note: "Runs in the local Chrome profile. The user signs in there; the agent never sees the password.",
        },
      ],
    });
  }

  if (name === "plan_application") {
    const p = args.profile ?? {};
    const profile: Profile = {
      id: "mcp:candidate",
      fullName: String(p.fullName ?? ""),
      ...(p.email ? { email: String(p.email) } : {}),
      ...(p.phone ? { phone: String(p.phone) } : {}),
      location: { city: String(p.city ?? ""), country: "IN" },
      links: p.linkedin ? { linkedin: String(p.linkedin) } : {},
      experience: [],
      education: [],
      skills: p.skills ?? [],
      ...(typeof p.years === "number" ? { yearsExperience: p.years } : {}),
      confirmedAt: new Date().toISOString(),
    };
    const job: Job = {
      id: "mcp:job",
      sourceId: "mcp",
      sourceUrl: "https://example.invalid",
      company: String(args.company ?? "Not stated"),
      title: String(args.title),
      location: String(args.location ?? ""),
      country: "IN",
      description: String(args.description),
      firstSeenAt: new Date().toISOString(),
      status: "open",
    };
    const fields = (args.fields ?? []) as DetectedField[];
    const plan = planApplication({
      job,
      profile,
      resumeVersionId: "mcp:resume",
      resumePath: "resume.pdf",
      fields,
    });
    const gate = canSubmit(plan, profile);
    return text({
      plan,
      gate,
      note: "Auto apply fills the form, submits when the mode allows, and records an application only after a confirmation page appears.",
    });
  }

  if (name === "upload_resume") {
    const rec = await saveResume(ROOT, String(args.text ?? ""), args.file ? String(args.file) : undefined);
    return text({
      ok: true,
      file: rec.file ?? null,
      characters: rec.text.length,
      savedAt: rec.savedAt,
      note: "Saved to data/resume.json. The console and every later tool read this copy.",
    });
  }

  if (name === "set_target_role") {
    const p = await saveProfile(ROOT, {
      role: String(args.role ?? ""),
      ...(typeof args.years === "number" ? { years: args.years } : {}),
      ...(args.details && typeof args.details === "object" ? { details: args.details } : {}),
    });
    return text({ ok: true, ...p, note: "Saved to data/profile.json." });
  }

  if (name === "market_summary" || name === "shortlist" || name === "geo_heatmap") {
    const role = String(args.role ?? (name === "geo_heatmap" ? "Product Manager" : ""));
    const req: JobRequest = {
      role,
      cities: args.city ? [String(args.city)] : [],
      skills: args.skills ?? [],
      years: typeof args.years === "number" ? args.years : undefined,
      responsibilities: args.skills ?? [],
      sources: name === "geo_heatmap" ? ["public"] : ["public", "naukri", "indeed"],
      profileDir: PROFILE_DIR,
      limit: 250,
      ...(typeof args.maxAgeDays === "number" ? { maxAgeDays: args.maxAgeDays } : name === "geo_heatmap" ? { maxAgeDays: 30 } : {}),
      ...(typeof args.minSalaryLpa === "number" ? { minSalaryLpa: args.minSalaryLpa } : {}),
      sourceKeys: await sourceKeys(),
    };
    const result = await discoverJobs(req);
    const jobs = result.jobs as ScoredJob[];
    const sum = marketSummary(jobs, {
      role,
      state: args.state ? String(args.state) : undefined,
      city: args.city ? String(args.city) : undefined,
      locality: args.locality ? String(args.locality) : undefined,
      remote: Boolean(args.remote),
      ...(typeof args.maxAgeDays === "number" ? { maxAgeDays: args.maxAgeDays } : {}),
      limit: typeof args.limit === "number" ? args.limit : 10,
    });
    if (name === "geo_heatmap") {
      return text({
        role,
        counts: sum.counts,
        geoDistribution: sum.geoDistribution,
        scoredAt: sum.scoredAt,
        note: "Real counts across fetched sources. Zero-hit localities show nearby corridor totals honestly.",
      });
    }
    if (name === "shortlist") {
      return text({
        role,
        geography: { state: sum.state ?? null, city: sum.city ?? null, locality: sum.locality ?? null, remote: Boolean(args.remote) },
        counts: sum.counts,
        shortlist: sum.shortlist,
        note: "Start with 10. Every application spends model tokens and the candidate's attention.",
      });
    }
    return text({
      ...sum,
      connectors: result.connectors,
      note: "Counts come from the postings the feeds returned. Nothing is estimated.",
    });
  }

  if (name === "tailor_batch") {
    const jobs = Array.isArray(args.jobs) ? args.jobs : [];
    if (!jobs.length) throw new Error("Pass at least one job.");
    const resume = await getResume(ROOT);
    if (!resume) throw new Error("No master resume yet. Call upload_resume first.");
    const prof = await getProfile(ROOT);
    const d = prof.details || {};
    const years = Number(String(prof.years ?? "").replace(/[^0-9.]/g, ""));

    const useSituational = args.situational !== false;
    const results: Array<{ id: string; ok: boolean; decision?: string; reason?: string; error?: string }> = [];
    for (const j of jobs) {
      const id = String(j.id ?? "");
      try {
        if (useSituational && typeof j.score === "number") {
          const strat = chooseResumeStrategy({
            title: String(j.title ?? ""),
            company: String(j.company ?? ""),
            jd: String(j.jd ?? j.description ?? ""),
            score: j.score,
            candidateYears: Number.isFinite(years) && years > 0 ? years : undefined,
            candidateText: resume.text,
            ...(Array.isArray(j.have) ? { have: j.have.map(String) } : {}),
            ...(Array.isArray(j.miss) ? { miss: j.miss.map(String) } : {}),
          });
          if (strat.strategy === "skip_or_manual") {
            results.push({ id, ok: true, decision: "skip_or_manual", reason: strat.reasons[0] });
            continue;
          }
          if (strat.strategy === "original") {
            const orig = await serverApi("/api/tailored/use-original", {
              jobId: id,
              job: { title: String(j.title ?? ""), company: String(j.company ?? "") },
              profile: {
                fullName: d.name ?? "",
                email: d.email ?? "",
                phone: d.phone ?? "",
                city: d.city ?? "",
                linkedin: d.linkedin ?? "",
                website: d.website ?? "",
                title: d.currentTitle ?? "",
                company: d.currentCompany ?? "",
              },
              resumeText: resume.text,
            });
            results.push(
              orig && orig.ok
                ? { id, ok: true, decision: "original", reason: strat.reasons[0] }
                : { id, ok: false, error: (orig && orig.error) || "Could not prepare original resume PDF." }
            );
            continue;
          }
        }
        const tailored = await serverApi("/api/tailor", {
          job: {
            title: String(j.title ?? ""),
            company: String(j.company ?? ""),
            description: String(j.jd ?? j.description ?? ""),
            location: String(j.location ?? ""),
          },
          profile: {
            name: d.name ?? "",
            email: d.email ?? "",
            phone: d.phone ?? "",
            location: d.city ?? "",
            linkedin: d.linkedin ?? "",
            website: d.website ?? "",
            title: d.currentTitle ?? "",
            company: d.currentCompany ?? "",
            years: Number.isFinite(years) && years > 0 ? years : undefined,
          },
          resumeText: resume.text,
        });
        if (!tailored || !tailored.ok) {
          results.push({ id, ok: false, error: (tailored && (tailored.hint || tailored.error || tailored.reason)) || "The model did not answer." });
          continue;
        }
        const { renderTailoredResumeHtml } = await import("./lib/resume-html");
        const html = renderTailoredResumeHtml(
          tailored,
          {
            fullName: d.name ?? undefined,
            email: d.email ?? undefined,
            phone: d.phone ?? undefined,
            city: d.city ?? undefined,
            links: {
              ...(d.linkedin ? { linkedin: d.linkedin } : {}),
              ...(d.website ? { portfolio: d.website } : {}),
            },
          },
          {
            company: String(j.company ?? ""),
            title: String(j.title ?? ""),
          },
        );
        const saved = await serverApi("/api/tailored/save", {
          jobId: id,
          data: tailored,
          html,
        });
        results.push(saved && saved.ok ? { id, ok: true, decision: "tailored" } : { id, ok: false, error: (saved && saved.error) || "Could not save the PDF." });
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return text({
      tailored: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      note: "Each PDF is saved with a hash. Auto apply attaches the exact file.",
    });
  }

  if (name === "start_apply_batch") {
    const rawJobs = Array.isArray(args.jobs) ? args.jobs : [];
    if (!rawJobs.length) throw new Error("Pass at least one job.");
    const jobs = rawJobs.map((j: any) => ({
      ...j,
      sourceUrl: j.sourceUrl || j.url || "",
      applyUrl: j.applyUrl || j.url || j.sourceUrl || "",
    }));
    const prof = await getProfile(ROOT);
    const d = prof.details || {};
    const years = Number(String(prof.years ?? "").replace(/[^0-9.]/g, ""));
    const r = await serverApi("/api/autoapply/start", {
      jobs,
      mode: args.mode === "fill" ? "fill" : "submit",
      cap: typeof args.cap === "number" ? args.cap : 10,
      profile: {
        fullName: d.name ?? "",
        email: d.email ?? "",
        phone: d.phone ?? "",
        city: d.city ?? "",
        linkedin: d.linkedin ?? "",
        website: d.website ?? "",
        currentCompany: d.currentCompany ?? "",
        currentTitle: d.currentTitle ?? "",
        years: Number.isFinite(years) && years > 0 ? years : undefined,
        ...(d.currentCtc ? { currentCtc: String(d.currentCtc) } : {}),
        ...(d.expectedCtc ? { expectedCtc: String(d.expectedCtc) } : {}),
        ...(d.noticePeriod ? { noticePeriod: String(d.noticePeriod) } : {}),
        ...(d.preferredWorkMode ? { preferredWorkMode: String(d.preferredWorkMode) } : {}),
        ...(d.willingToRelocate ? { willingToRelocate: String(d.willingToRelocate) } : {}),
        ...(d.workAuthorization ? { workAuthorization: String(d.workAuthorization) } : {}),
        ...(d.preferredLocality ? { preferredLocality: String(d.preferredLocality) } : {}),
      },
    });
    return text(r);
  }

  if (name === "get_apply_status") {
    const r = await serverApi("/api/autoapply/status");
    const st = r.state || {};
    const challenge = st.ask ? toAgentChallenge(st.ask, SERVER) : null;
    return text({
      running: Boolean(st.running),
      current: st.current ?? null,
      cap: st.cap ?? null,
      used: st.used ?? null,
      ask: st.ask ?? null,
      challenge,
      items: (st.items || []).map((i: any) => ({
        id: i.id,
        title: i.title,
        company: i.company,
        status: i.status,
        needs: i.needs ?? null,
        fields: i.fields ?? null,
        confirmation: i.confirmation ?? null,
        message: i.message ?? null,
      })),
      note: challenge
        ? `${challenge.errorCode}: ${challenge.policyNote}`
        : st.running
          ? "Running. Poll again in a few seconds."
          : "Not running.",
    });
  }

  if (name === "answer_ask") {
    const r = await serverApi("/api/autoapply/answer", { id: String(args.id ?? ""), value: String(args.value ?? "") });
    return text(r);
  }

  if (name === "resume_apply_batch") {
    const r = await serverApi("/api/autoapply/retry", {});
    return text(r);
  }

  if (name === "list_sites") {
    return text({ sites: await listSites(DATA) });
  }

  if (name === "forget_site") {
    const removed = await forgetSite(DATA, String(args.host ?? ""));
    return text({ ok: true, removed, host: String(args.host ?? "") });
  }

  if (name === "view_screen") {
    return text(await executeAction(SHARED_ACTIONS.view_screen, {}, { dataDir: DATA }));
  }

  if (name === "navigate") {
    return text(await executeAction(SHARED_ACTIONS.navigate, args, { dataDir: DATA }));
  }

  if (name === "choose_resume_strategy") {
    const resume = await getResume(ROOT);
    const prof = await getProfile(ROOT);
    const years = Number(String(prof.years ?? "").replace(/[^0-9.]/g, ""));
    return text(
      await executeAction(
        SHARED_ACTIONS.choose_resume_strategy,
        {
          ...args,
          ...(args.candidateYears == null && Number.isFinite(years) && years > 0 ? { candidateYears: years } : {}),
          ...(resume?.text ? { candidateText: resume.text } : {}),
        },
        { dataDir: DATA },
      ),
    );
  }

  if (name === "record_learning") {
    return text(await executeAction(SHARED_ACTIONS.record_learning, args, { dataDir: DATA }));
  }

  if (name === "prepare_submit") {
    const { approved, approvalArgumentsHash, ...payload } = args;
    return text(
      await executeAction(SHARED_ACTIONS.prepare_submit, payload, {
        dataDir: DATA,
        approved: Boolean(approved),
        approvalArgumentsHash: approvalArgumentsHash ? String(approvalArgumentsHash) : undefined,
      }),
    );
  }

  if (name === "startup_radar") {
    const sector = args.sector ? String(args.sector).toLowerCase() : "";
    const city = args.city ? String(args.city).toLowerCase() : "";
    const indexMeta = args.sync ? await syncStartupIndex(DATA) : null;
    const companies = STARTUP_RADAR_SEEDS.filter((c) => {
      if (sector && c.sector.toLowerCase() !== sector) return false;
      if (city && !c.city.toLowerCase().includes(city)) return false;
      return true;
    });
    return text({
      ...(indexMeta ? { indexMeta } : {}),
      categories: JOB_CATEGORIES.map(({ id, label, tier, sampleTitles }) => ({ id, label, tier, sampleTitles })),
      companies,
      portalAuthProfiles: PORTAL_AUTH_PROFILES,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

/* ------------------------------------------------------------------ */
/* transport                                                           */
/* ------------------------------------------------------------------ */

/** Shared JSON-RPC dispatcher used by both stdio transport and HTTP /api/mcp. */
export async function dispatchMcpRpc(msg: any): Promise<any | undefined> {
  const { id, method, params } = msg ?? {};

  try {
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: negotiateProtocol(params?.protocolVersion),
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }

    if (method === "notifications/initialized") return undefined;

    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };

    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };

    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};
      try {
        const result = await callTool(name, args);
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
            isError: true,
          },
        };
      }
    }

    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) {
    return { jsonrpc: "2.0", id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } };
  }
}

const isMain = Boolean(
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
);

if (isMain) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: any;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      return;
    }

    const out = await dispatchMcpRpc(msg);
    if (out !== undefined) process.stdout.write(JSON.stringify(out) + "\n");
  });

  process.stderr.write(`career-ops-india MCP server ready (${TOOLS.length} tools)\n`);
}
