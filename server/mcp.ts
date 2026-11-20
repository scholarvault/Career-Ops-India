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
import { join } from "node:path";
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
} from "./lib/discovery";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PROFILE_DIR = join(ROOT, "data", "browser-profile");
const SECRETS_FILE = join(ROOT, "data", "secrets.json");

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
    };
  } catch {
    return {};
  }
}

const SERVER_INFO = { name: "career-ops-india", version: "0.1.0" };
const PROTOCOL = "2024-11-05";

/* ------------------------------------------------------------------ */
/* tools                                                               */
/* ------------------------------------------------------------------ */

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const TOOLS: Tool[] = [
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
      "Build an application plan for one posting: which fields can be filled from the profile, which need the candidate, and whether the approval gate allows submission. It never submits.",
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
];

/* ------------------------------------------------------------------ */
/* handlers                                                            */
/* ------------------------------------------------------------------ */

function text(value: unknown) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

async function callTool(name: string, args: any) {
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
        title: j.title,
        company: j.company,
        location: j.location,
        workMode: j.workMode,
        score: j.score,
        matched: j.matched,
        source: j.source,
        datePosted: j.datePosted,
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
      note: "The agent fills the form. The candidate presses submit. A confirmation page is required before an application is recorded.",
    });
  }

  throw new Error(`Unknown tool: ${name}`);
}

/* ------------------------------------------------------------------ */
/* transport                                                           */
/* ------------------------------------------------------------------ */

function reply(id: unknown, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function fail(id: unknown, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: any;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return fail(null, -32700, "Parse error");
  }

  const { id, method, params } = msg;

  try {
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    }

    if (method === "notifications/initialized") return;

    if (method === "ping") return reply(id, {});

    if (method === "tools/list") return reply(id, { tools: TOOLS });

    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};
      try {
        const result = await callTool(name, args);
        return reply(id, result);
      } catch (e) {
        return reply(id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }

    return fail(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    return fail(id, -32603, e instanceof Error ? e.message : String(e));
  }
});

process.stderr.write(`career-ops-india MCP server ready (${TOOLS.length} tools)\n`);
