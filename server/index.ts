// Career-Ops India - local server.
// Serves the prototype pages and the real API behind them:
//   GET  /api/connectors   live status of every job source
//   POST /api/jobs         run discovery, score, return postings
//   GET  /api/settings     AI provider + whether a key is stored
//   POST /api/settings     save provider/model/baseUrl
//   POST /api/settings/key save the API key (never returned)
//   POST /api/ai/test      one tiny call to prove the key works
//
// Run with: pnpm ui   (tsx server/index.ts)

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BOARDS,
  discoverJobs,
  inIndia,
  profileFor,
  prefsFor,
  runBoard,
  scoreOne,
  warmBoards,
  type JobRequest,
} from "./lib/discovery";
import { AGGREGATORS } from "./connectors/aggregators";
import { COMPANY_PORTALS, WORKDAY_PORTALS, runCompanyPortal } from "./connectors/companies";
import { REMOTE_SOURCES, runRemote } from "./connectors/remote";
import { discoverFreelance } from "./connectors/freelance";
import { fillApplication, closeFillWindow, FILLABLE_SOURCES } from "./connectors/fill";
import { fetchIndeedDetail } from "./connectors/indeed";
import {
  NAUKRI_API_POLICY,
  NaukriApiError,
  applyJob as naukriApply,
  applicationHistory as naukriHistory,
  clearSession as naukriLogout,
  importFromBrowser as naukriImport,
  loadSession as naukriLoad,
  login as naukriLogin,
  searchJobs as naukriSearch,
  sendOtp as naukriSendOtp,
  status as naukriStatus,
  verifyOtp as naukriVerifyOtp,
} from "./connectors/naukriApi";
import { assertCanApply, capState, readAudit, recordApply } from "./lib/audit";
import { keywordGap } from "./lib/ats";
import { appearsIn, mentions, resumeBaseline } from "./lib/baseline";
import { cacheSummary, forgetForm } from "./lib/formcache";
import {
  HAS_CHROME,
  back,
  closeBrowser,
  currentPage,
  frame,
  isPaused,
  navigate,
  openVisible,
  pageState,
  sendInput,
  setPaused,
} from "./lib/browser";
import { loadTailored, saveTailored } from "./lib/tailored";
import { queueState, resumeQueue, retryJob, startQueue, stopQueue, subscribeQueue } from "./lib/autoapply";
import { answerAsk, askState } from "./lib/asks";
import { forgetSite, listSites } from "./lib/sites";
import { marketSummary } from "./lib/market";
import { getProfile, getResume, saveProfile, saveResume } from "./lib/profile-store";

/* Load .env when present. Node >= 20.6 does this natively; a missing file is
   not an error, so a fresh clone still starts with no configuration. */
try {
  process.loadEnvFile();
} catch {
  /* no .env — the UI can still store a key in data/secrets.json */
}

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const UI = join(ROOT, "ui");
const DATA = join(ROOT, "data");
const PORT = Number(process.env.PORT || 4173);

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

type Settings = { provider: string; model: string; baseUrl: string };
type Secrets = {
  apiKey?: string;
  adzunaAppId?: string;
  adzunaAppKey?: string;
  joobleKey?: string;
  careerjetKey?: string;
  careerjetDataKey?: string;
};

const DEFAULT_SETTINGS: Settings = {
  provider: "sarvam",
  model: "sarvam-105b",
  baseUrl: "https://api.sarvam.ai/v1",
};

const PROVIDERS: Record<string, { label: string; baseUrl: string; model: string; keyUrl: string }> = {
  sarvam: { label: "Sarvam (included)", baseUrl: "https://api.sarvam.ai/v1", model: "sarvam-105b", keyUrl: "https://dashboard.sarvam.ai" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", keyUrl: "https://platform.openai.com/api-keys" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5", keyUrl: "https://console.anthropic.com" },
  google: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash", keyUrl: "https://aistudio.google.com/app/apikey" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat", keyUrl: "https://openrouter.ai/keys" },
  custom: { label: "Custom (OpenAI-compatible)", baseUrl: "", model: "", keyUrl: "" },
  none: { label: "No AI (deterministic only)", baseUrl: "", model: "", keyUrl: "" },
};

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(DATA, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

const settingsFile = join(DATA, "settings.json");
const secretsFile = join(DATA, "secrets.json");

async function loadSettings(): Promise<Settings> {
  const saved = await readJson<Partial<Settings>>(settingsFile, {});
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  /* Sarvam renamed its chat models. A settings file written before the rename
     would keep failing with "invalid model", so move it to the current one. */
  if (merged.provider === "sarvam" && /^deepseek/i.test(merged.model)) {
    merged.model = DEFAULT_SETTINGS.model;
  }
  return merged;
}

async function loadSecrets(): Promise<Secrets> {
  const stored = await readJson<Secrets>(secretsFile, {});
  /* An environment key wins over the file, so a deploy never depends on a
     secret sitting on disk. The UI still writes data/secrets.json locally. */
  const envKey = process.env.SARVAM_API_KEY?.trim();
  return envKey ? { ...stored, apiKey: envKey } : stored;
}

/* ------------------------------------------------------------------ */
/* http                                                                */
/* ------------------------------------------------------------------ */

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function send(res: any, status: number, body: unknown, type = "application/json") {
  const payload = type === "application/json" ? JSON.stringify(body) : body;
  /* charset matters: without it a Windows client can decode a curly quote as
     ANSI and turn a sentence into mojibake. */
  const ct = type === "application/json" ? "application/json; charset=utf-8" : type;
  res.writeHead(status, { "content-type": ct, "cache-control": "no-store, must-revalidate" });
  res.end(payload);
}

async function body(req: any): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/* Models do not always answer with one clean object. sarvam-105b-conversations
   sometimes writes a malformed first attempt, leaks chat-template tokens, adds
   a "Constraints check" paragraph, then writes the object again. So: find every
   balanced {...} in the text, parse each, and keep the last one that is really
   our shape. Outer-brace slicing fails on exactly this output. */
function pickJson(s: string): any | null {
  const found: any[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const slice = s.slice(i, j + 1);
          try {
            const o = JSON.parse(slice);
            if (o && typeof o === "object" && ("keywords" in o || "summary" in o)) found.push(o);
          } catch {
            /* a malformed attempt: skip it, the model usually writes another */
          }
          break;
        }
      }
    }
  }
  return found.length ? found[found.length - 1] : null;
}

/* A model that hits its token limit stops mid-object. Close the string and
   the brackets it left open so the part it did write can still be used. */
function repairJson(s: string): string {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = s.replace(/,\s*$/, "");
  if (inStr) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "{" ? "}" : "]";
  return out;
}

/* ---------- summary quality ---------- */

const summaryTokens = (s: string) =>
  new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9+# ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

/** How much of the shorter summary is repeated in the longer one, 0..1. */
function summaryOverlap(a: string, b: string): number {
  const A = summaryTokens(a);
  const B = summaryTokens(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / Math.min(A.size, B.size);
}

function firstSentence(s: string): string {
  const t = String(s || "").trim();
  const m = t.match(/^.*?[.!?](?:\s|$)/);
  return (m ? m[0] : t).trim();
}

const plain = (s: string) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* Words too common to be worth bolding in a CV. */
const GENERIC_HIGHLIGHT = new Set([
  "engineering", "product", "products", "data", "team", "teams", "work", "works",
  "experience", "management", "manager", "business", "systems", "system", "tools",
  "platform", "platforms", "operations", "strategy", "growth", "research", "analysis",
  "design", "development", "support", "service", "services", "technology",
  "solutions", "project", "projects", "delivery", "quality", "process", "processes",
]);

/**
 * Why a tailored summary is not good enough, or null when it is. The master
 * summary is the same for every posting, so a model that returns it unchanged
 * has not tailored anything. This catches that instead of trusting the prompt.
 */
function summaryProblem(after: string, before: string): string | null {
  const a = String(after || "").trim();
  if (a.length < 80) return "too short";
  const sentences = a.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0);
  if (sentences.length < 2) return "only one sentence";
  const opening = (s: string) => plain(firstSentence(s)).split(" ").slice(0, 8).join(" ");
  if (before && opening(a) === opening(before)) return "the same opening as the master resume";
  if (before && plain(firstSentence(a)) === plain(firstSentence(before))) return "the same opening sentence as the master resume";
  /* Two whole sentences carried over is not a rewrite, even if the opening
     changed. One reused fact sentence is fine; the rest must be re-cut. */
  if (before) {
    const b = plain(before);
    const copied = sentences.filter((s) => plain(s).length > 50 && b.includes(plain(s))).length;
    if (copied >= 2) return "reusing whole sentences from the master summary";
  }
  if (before && summaryOverlap(a, before) > 0.82) return "too close to the master summary";
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  try {
    /* ---------------- API ---------------- */

    if (path === "/api/connectors") {
      const [results, remoteRuns, freelanceRun] = await Promise.all([
        Promise.all(BOARDS.map(runBoard)),
        Promise.all(REMOTE_SOURCES.map(async (s) => ({ source: s, result: await runRemote(s, "") }))),
        discoverFreelance("product manager", 10),
      ]);
      const sec = await loadSecrets();
      const chrome = [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ].find((p) => existsSync(p));

      return send(res, 200, {
        connectors: [
          ...results.map((r) => ({
            id: r.board.id,
            kind: r.board.kind,
            company: r.board.company,
            ok: !r.error,
            count: r.jobs.length,
            india: r.jobs.filter((j) => inIndia(j.location)).length,
            ms: r.ms,
            ...(r.error ? { error: r.error } : {}),
          })),
          ...remoteRuns.map((r) => ({
            id: r.source.id,
            kind: "free-api",
            company: r.source.label,
            ok: !r.result.error,
            count: r.result.jobs.length,
            india: r.result.jobs.filter((j) => inIndia(j.location)).length,
            ms: r.result.ms,
            note: "Free, no key. Remote roles open to India.",
            ...(r.result.error ? { error: r.result.error } : {}),
          })),
          {
            id: "freelancer",
            kind: "free-api",
            company: "Freelancer.com",
            ok: !freelanceRun.error,
            count: freelanceRun.jobs.length,
            india: freelanceRun.jobs.length,
            ms: freelanceRun.ms,
            note: "Free, no key. Freelance projects, remote worldwide.",
            ...(freelanceRun.error ? { error: freelanceRun.error } : {}),
          },
          {
            id: "naukri",
            kind: "browser",
            company: "Naukri",
            ok: Boolean(chrome),
            count: null,
            india: null,
            ms: 0,
            note: chrome
              ? "Runs in the local Chrome profile. Opens a window; sign in once."
              : "Chrome or Edge not found on this machine.",
          },
          {
            id: "indeed",
            kind: "browser",
            company: "Indeed India",
            ok: Boolean(chrome),
            count: null,
            india: null,
            ms: 0,
            note: chrome
              ? "Runs in a real Chrome profile. Cloudflare clears on the first visit; no sign-in needed to search."
              : "Chrome or Edge not found on this machine.",
          },
          ...AGGREGATORS.filter((a) => !a.paid).map((a) => ({
            id: a.id,
            kind: "api",
            company: a.label,
            ok: a.hasKey(sec),
            count: null,
            india: null,
            ms: 0,
            note: a.hasKey(sec) ? "Key stored. Runs with every live search." : `Needs a key — ${a.free}.`,
            signup: a.signup,
          })),
        ],
      });
    }

    if (path === "/api/jobs" && req.method === "POST") {
      const reqBody = (await body(req)) as JobRequest;
      const sec = await loadSecrets();
      const result = await discoverJobs({
        ...reqBody,
        profileDir: join(DATA, "browser-profile"),
        sourceKeys: {
          adzunaAppId: sec.adzunaAppId,
          adzunaAppKey: sec.adzunaAppKey,
          joobleKey: sec.joobleKey,
          careerjetKey: sec.careerjetKey,
          careerjetDataKey: sec.careerjetDataKey,
          jsearchKey: sec.jsearchKey,
        },
      });
      return send(res, 200, { ok: true, ...result });
    }

    if (path === "/api/settings" && req.method === "GET") {
      const s = await loadSettings();
      const sec = await loadSecrets();
      return send(res, 200, {
        ...s,
        hasKey: Boolean(sec.apiKey),
        providers: PROVIDERS,
        sources: AGGREGATORS.filter((a) => !a.paid).map((a) => ({
          id: a.id,
          label: a.label,
          fields: a.fields,
          signup: a.signup,
          free: a.free,
          hasKey: a.hasKey(sec),
        })),
      });
    }

    if (path === "/api/settings" && req.method === "POST") {
      const b = (await body(req)) as Partial<Settings>;
      const current = await loadSettings();
      const next: Settings = {
        provider: b.provider ?? current.provider,
        model: b.model ?? current.model,
        baseUrl: b.baseUrl ?? current.baseUrl,
      };
      await writeJson(settingsFile, next);
      return send(res, 200, { ok: true, ...next });
    }

    if (path === "/api/settings/key" && req.method === "POST") {
      const b = (await body(req)) as { apiKey?: string };
      if (!b.apiKey || b.apiKey.length < 8) return send(res, 400, { ok: false, error: "Key looks too short." });
      /* merge: the same file holds the job-source keys */
      await writeJson(secretsFile, { ...(await loadSecrets()), apiKey: b.apiKey });
      return send(res, 200, { ok: true, hasKey: true });
    }

    if (path === "/api/settings/key" && req.method === "DELETE") {
      const { apiKey: _drop, ...rest } = await loadSecrets();
      await writeJson(secretsFile, rest);
      return send(res, 200, { ok: true, hasKey: false });
    }

    /* ---- job-source keys (Adzuna / Jooble / Careerjet) ---- */

    if (path === "/api/settings/source-key" && req.method === "POST") {
      const b = (await body(req)) as { source?: string; values?: Record<string, string> };
      const agg = AGGREGATORS.find((a) => a.id === b.source);
      if (!agg) return send(res, 400, { ok: false, error: "Unknown source." });
      const sec = await loadSecrets();
      for (const f of agg.fields) {
        const v = String(b.values?.[f.key] ?? "").trim();
        if (v) (sec as Record<string, unknown>)[f.key] = v;
      }
      await writeJson(secretsFile, sec);
      return send(res, 200, { ok: true, hasKey: agg.hasKey(sec) });
    }

    if (path === "/api/settings/source-key" && req.method === "DELETE") {
      const source = url.searchParams.get("source") ?? "";
      const agg = AGGREGATORS.find((a) => a.id === source);
      if (!agg) return send(res, 400, { ok: false, error: "Unknown source." });
      const sec = await loadSecrets() as Record<string, unknown>;
      for (const f of agg.fields) delete sec[f.key];
      await writeJson(secretsFile, sec);
      return send(res, 200, { ok: true, hasKey: false });
    }

    if (path === "/api/explain" && req.method === "POST") {
      const b = (await body(req)) as {
        job?: { title?: string; company?: string; description?: string };
        profile?: { role?: string; skills?: string[]; years?: number; city?: string };
        score?: number;
        missing?: string[];
      };
      const s = await loadSettings();
      const sec = await loadSecrets();
      if (s.provider === "none" || !sec.apiKey) {
        return send(res, 200, { ok: false, reason: "no-key" });
      }

      const job = b.job ?? {};
      const p = b.profile ?? {};
      const prompt = [
        `Candidate target role: ${p.role || "not stated"}.`,
        `Candidate skills: ${(p.skills ?? []).join(", ") || "not stated"}.`,
        `Years of experience: ${typeof p.years === "number" ? p.years : "not stated"}.`,
        `City: ${p.city || "not stated"}.`,
        "",
        `Job: ${job.title || ""} at ${job.company || ""}.`,
        `Deterministic score: ${typeof b.score === "number" ? b.score : "not stated"} out of 100.`,
        `Skills the posting asks for that the CV does not show: ${(b.missing ?? []).join(", ") || "none listed"}.`,
        "",
        "Job description excerpt:",
        String(job.description || "").slice(0, 2500),
        "",
        "Write two short sentences for the candidate: why this posting fits, and the one gap to address.",
        "Do not invent experience, employers or numbers. Do not restate the score. Plain text, no markdown.",
      ].join("\n");

      const t0 = Date.now();
      try {
        const r = await fetch(`${s.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${sec.apiKey}` },
          body: JSON.stringify({
            model: s.model,
            messages: [{ role: "user", content: prompt }],
            /* sarvam-105b is a reasoning model: it spends tokens on
               reasoning_content before it writes the answer, so a small
               budget returns an empty message. */
            max_tokens: 4000,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(45000),
        });
        const text = await r.text();
        if (!r.ok) {
          let hint: string | undefined;
          try {
            const j = JSON.parse(text);
            const msg = String(j?.error?.message ?? "");
            const allowed = msg.match(/should be one of ([^.]+)/i)?.[1];
            if (allowed) hint = `This provider does not accept "${s.model}". Use one of: ${allowed.trim()}.`;
          } catch {}
          return send(res, 200, { ok: false, status: r.status, error: text.slice(0, 240), ...(hint ? { hint } : {}) });
        }
        const j = JSON.parse(text);
        const out = String(j?.choices?.[0]?.message?.content ?? "").trim();
        if (!out) return send(res, 200, { ok: false, reason: "empty", error: "The model returned no text." });
        return send(res, 200, { ok: true, text: out, model: s.model, ms: Date.now() - t0 });
      } catch (e) {
        return send(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (path === "/api/tailor" && req.method === "POST") {
      const b = (await body(req)) as {
        job?: { title?: string; company?: string; description?: string; location?: string };
        profile?: {
          name?: string; email?: string; phone?: string; location?: string;
          linkedin?: string; website?: string; title?: string; company?: string;
          years?: number; skills?: string[];
        };
        resumeText?: string;
      };
      const s = await loadSettings();
      const sec = await loadSecrets();
      if (s.provider === "none" || !sec.apiKey) {
        return send(res, 200, { ok: false, reason: "no-key", hint: "Add a Sarvam key in Connections to tailor." });
      }

      const job = b.job ?? {};
      const p = b.profile ?? {};
      /* A two-page master resume is ~8.6k chars. The old 8k cap cut off the
         education, certifications and languages at the end, so the model
         "forgot" them. Keep the whole file. */
      const resume = String(b.resumeText || "").slice(0, 20000);
      if (resume.trim().length < 200) {
        return send(res, 200, {
          ok: false,
          reason: "no-resume",
          hint: "Upload your master resume in onboarding first. Tailoring re-cuts that file; it never writes one from scratch.",
        });
      }
      /* the "before" side of the diff, read from the master resume itself */
      const baseline = resumeBaseline(resume);

      const prompt = [
        "You are tailoring an existing resume to one job posting. You are not writing a new resume.",
        "",
        "HARD RULES",
        "1. Never invent an employer, job title, date, degree, certification, metric or skill.",
        "2. Only rephrase, reorder and select what is already in the resume text below.",
        "3. Every number you write must already appear in the resume. If none is there, write none.",
        "4. If the posting asks for something the resume does not show, put it in gaps. Do not add it.",
        "5. Keep every role, project, education entry, certification and language that appears in the resume. Do not drop any.",
        "6. Plain text only. No markdown, no asterisks, no emoji.",
        "7. Copy dates exactly as printed beside that role or degree. If no date is printed, leave it empty. Never infer, shift or reuse a date.",
        "8. education is degrees only. Certifications go in certifications, never in education.",
        "9. languages is an array of plain strings, never objects. Copy the language and its level exactly as printed, e.g. \"English: Professional Working Proficiency\".",
        "10. The summary must not claim a duty from the job description. If the resume does not say the candidate did it, it does not go in the summary. Do not write a cover letter.",
        "",
        `JOB: ${job.title || ""} at ${job.company || ""} (${job.location || "location not stated"})`,
        "JOB DESCRIPTION:",
        String(job.description || "").slice(0, 4000),
        "",
        `CANDIDATE: ${p.name || ""} | ${p.title || ""} at ${p.company || ""} | ${p.years ?? "?"} years | ${p.location || ""}`,
        `CANDIDATE SKILLS (from the resume): ${baseline.skills.slice(0, 40).join(", ") || "not stated"}`,
        "",
        `EXISTING SUMMARY (rewrite this, keep its facts): ${baseline.summary || "not found"}`,
        "",
        "",
        "RESUME TEXT:",
        resume,
        "",
        "Return ONE JSON object and nothing else, in this exact shape:",
        `{"headline":"the candidate's current title, taken from the resume",` +
          `"summaryMode":"modify|update|rewrite",` +
          `"summary":"3 to 4 sentences written for this posting. Open with who the candidate actually is (for example 'Product leader with 7 years...'), not with the posting's title. The first sentence must be new and must connect the candidate's real experience to the two strongest matching themes in the posting, in the posting's words. Then 2-3 sentences of the resume facts that best support this posting, re-cut in the posting's words rather than copied from the master summary. Do not reuse the existing summary's opening sentence or whole sentences from it. Never claim the candidate has held the posting's title or worked in its team.",` +
          `"skills":[{"group":"a group name the resume already uses, e.g. Product or AI & Automation","items":["a skill named in the resume"]}],` +
          `"experience":[{"role":"title from the resume","company":"employer from the resume","dates":"dates from the resume","location":"city from the resume","lines":["rewritten bullet, 2 to 5 per role"]}],` +
          `"projects":[{"name":"project name from the resume","lines":["what it was, from the resume"]}],` +
          `"education":[{"degree":"degree from the resume","school":"institution from the resume","dates":"dates from the resume","detail":"specialization or marks, from the resume"}],` +
          `"certifications":["certification from the resume"],` +
          `"languages":["language: level, exactly as printed in the resume"],` +
          `"keywords":[{"term":"exact phrase from the posting","inResume":true}],` +
          `"gaps":["what the posting asks for that the resume does not show"]}`,
        "",
        "skills: group them the way the resume groups them. Use only skills named in the resume.",
        "summary: choose the mode that fits this posting. modify = keep the existing structure and swap in the posting's vocabulary. update = keep one or two sentences and replace the rest with the facts that matter most here. rewrite = write a new summary from the resume's facts, led by the posting's themes. In every mode the first sentence must be new and must not copy the existing opening. Never open with the posting's title as if it were the candidate's current role. Connect to the posting's themes as focus or alignment; never claim the candidate has done something the resume does not show (for example, do not say 'global marketplaces' unless the resume does). The summary is the one part you may fully rewrite; the rest of the resume must keep every role, date, employer, degree, certification and language.",
        "ATS: the summary, skills and bullets should use the posting's exact terms where the resume already proves them. Never add a term the resume does not show.",
        "experience: every role in the resume, most relevant first. Keep the original dates, employers and locations exactly. Give each role 2 to 5 bullets, choosing the ones that best match the posting; if the resume has fewer than 2 bullets for a role, keep what it has.",
        "projects: every project in the resume.",
        "education: one row per degree. Put the specialization and dates in the same row as the degree. Do not create a separate row for a specialization, and do not put certifications here.",
        "certifications: every certification.",
        "languages: every language.",
        "dates: copy the exact range printed beside that entry; leave empty if none is printed.",
        "keywords: 12 to 15 of the most important phrases in the posting. inResume is true only if the resume already shows it.",
        "Your entire reply is that one JSON object. No checklist, no commentary, no second copy, no chat tokens.",
      ].join("\n");

      const t0 = Date.now();
      try {
        /* sarvam-105b is a reasoning model: on a long structured prompt it
           spends the whole token budget on reasoning_content and returns an
           empty message (finish_reason "length"). The conversations variant
           answers the same JSON in under a second with no reasoning. */
        const tailorModel = s.model === "sarvam-105b" ? "sarvam-105b-conversations" : s.model;

        const callModel = async (content: string, maxTokens = 8000) => {
          const r = await fetch(`${s.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${sec.apiKey}` },
            body: JSON.stringify({
              model: tailorModel,
              messages: [{ role: "user", content }],
              max_tokens: maxTokens,
              temperature: 0.2,
            }),
            signal: AbortSignal.timeout(90000),
          });
          const text = await r.text();
          if (!r.ok) throw new Error(text.slice(0, 240));
          const j = JSON.parse(text);
          const out = String(j?.choices?.[0]?.message?.content ?? "").trim();
          if (!out) throw new Error("The model returned no text.");
          return out;
        };

        const ask = (extra?: string) => callModel(extra ? `${prompt}\n\n${extra}` : prompt);

        /* the model sometimes wraps JSON in a fence, adds a sentence, or is
           cut off by the token limit. Take the last object that parses. */
        const parseOut = (out: string) => {
          let parsed = pickJson(out);
          if (!parsed) {
            const a = out.indexOf("{");
            if (a >= 0) {
              try { parsed = JSON.parse(repairJson(out.slice(a))); } catch { parsed = null; }
            }
          }
          return parsed;
        };

        const str = (v: any) => String(v ?? "").trim();
        const arr = (v: any) => (Array.isArray(v) ? v : []);

        /* Which master-resume roles the answer left out. The model drops the
           advisory roles when it decides they are less relevant, even though
           rule 5 says to keep every role. */
        const missingRoles = (p: any): string[] => {
          const exp = Array.isArray(p?.experience) ? p.experience : [];
          /* a role with no bullets is dropped by the normaliser below, so it
             counts as missing here too */
          const got = exp
            .filter((r: any) => Array.isArray(r?.lines) && r.lines.length > 0)
            .map((r: any) => `${r?.role ?? ""} ${r?.company ?? ""}`.toLowerCase());
          return baseline.roles
            .filter((b) => {
              const tokens = b.line.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
              return !got.some((g) => tokens.filter((t) => g.includes(t)).length >= Math.min(2, tokens.length));
            })
            .map((b) => b.line);
        };

        /* Certifications and languages are facts, not choices. If the answer
           drops one, ask again before showing a resume that is missing it. */
        const missingFacts = (p: any): string[] => {
          const certs = arr(p?.certifications).map(str).join(" · ");
          const langs = arr(p?.languages)
            .map((l: any) => (typeof l === "string" ? l : `${l?.language ?? ""}: ${l?.level ?? ""}`))
            .join(" · ");
          const out: string[] = [];
          for (const c of baseline.certifications) if (!appearsIn(certs, c)) out.push(c);
          for (const l of baseline.languages) if (!appearsIn(langs, l)) out.push(l);
          return out;
        };

        let out = await ask();
        let parsed = parseOut(out);
        /* a stub (summary + skills, no roles) is worse than a retry: the whole
           point is re-cutting the master resume, not writing a thin one. */
        let missing = parsed ? missingRoles(parsed) : [];
        let missingFactList = parsed ? missingFacts(parsed) : [];
        let summaryIssue = parsed ? summaryProblem(str(parsed.summary), baseline.summary) : "missing";
        if (
          !parsed ||
          !Array.isArray(parsed.experience) ||
          parsed.experience.length === 0 ||
          missing.length ||
          missingFactList.length ||
          summaryIssue
        ) {
          const parts: string[] = [];
          if (missing.length) {
            parts.push(
              `You left out these roles from the resume: ${missing.join("; ")}. Return the full JSON again and include every one of them, with their original dates, employers and at least one bullet each.`
            );
          }
          if (missingFactList.length) {
            parts.push(
              `You left out these certifications or languages: ${missingFactList.join("; ")}. Include every one exactly as printed in the resume.`
            );
          }
          if (summaryIssue) {
            parts.push(
              `Your summary is ${summaryIssue}. Rewrite it for this posting: a new opening sentence that says who the candidate actually is and connects their real experience to the two strongest matching themes, then 2-3 sentences of the resume facts that best support this posting. Re-cut those facts in the posting's words instead of copying whole sentences from the master summary. Drop facts that do not bear on it. Never claim the candidate has held the posting's title.`
            );
          }
          out = await ask(parts.length ? parts.join(" ") : undefined);
          parsed = parseOut(out);
          missing = parsed ? missingRoles(parsed) : [];
          missingFactList = parsed ? missingFacts(parsed) : [];
          summaryIssue = parsed ? summaryProblem(str(parsed.summary), baseline.summary) : "missing";
        }
        if (!parsed) {
          console.error("[tailor] unparseable model output:", out.slice(0, 400));
          return send(res, 200, { ok: false, reason: "not-json", error: "Sarvam returned an incomplete answer. Try again." });
        }
        if (!Array.isArray(parsed.experience) || parsed.experience.length === 0) {
          return send(res, 200, {
            ok: false,
            reason: "incomplete",
            error: "Sarvam returned a partial resume. Try again — the posting is still open.",
          });
        }

        /* The summary is the one section the user checks first, and the model
           keeps returning the master's opening. If the retry did not fix it,
           ask for the summary alone: a short, focused call is more reliable
           than a third pass over the whole JSON. */
        let summaryMode = ["modify", "update", "rewrite"].includes(str(parsed.summaryMode).toLowerCase())
          ? str(parsed.summaryMode).toLowerCase()
          : "update";
        if (summaryIssue) {
          try {
            const focus = [
              "Rewrite only the professional summary of this resume for one job posting.",
              "Use only facts that appear in the resume. Never invent an employer, metric, tool or duty.",
              "Write 3 sentences. Open with who the candidate actually is (for example 'Product leader with 7 years...'), not with the posting's title. The first sentence must be new and must connect the candidate's real experience to the two strongest matching themes in the posting, in the posting's words. Do not copy the existing summary's opening sentence, and do not reuse whole sentences from it: re-cut the same facts in the posting's words. Never claim the candidate has held the posting's title or worked in its team.",
              "The summary must read as this candidate's experience, not as the posting's requirements. No cover letter.",
              "",
              `JOB: ${job.title || ""} at ${job.company || ""}`,
              "JOB DESCRIPTION:",
              String(job.description || "").slice(0, 3000),
              "",
              "RESUME:",
              resume.slice(0, 12000),
              "",
              `EXISTING SUMMARY (do not copy its opening): ${baseline.summary || "not found"}`,
              "",
              "Return only the summary text, no JSON, no quotes, no heading.",
            ].join("\n");
            const text = (await callModel(focus, 700))
              .replace(/^```[a-z]*\s*/i, "")
              .replace(/```$/, "")
              .replace(/^["'“]|["'”]$/g, "")
              .trim();
            if (text.length >= 80) {
              parsed.summary = text;
              summaryMode = "rewrite";
              summaryIssue = summaryProblem(text, baseline.summary);
            }
          } catch {
            /* keep the main answer; the UI still shows the before/after */
          }
        }

        const keywords = arr(parsed.keywords)
          .map((k: any) => ({ term: str(k?.term), inResume: mentions(resume, str(k?.term)) }))
          .filter((k: any) => k.term)
          /* an employer or a city is not a keyword the candidate can show */
          .filter((k: any) => {
            const t = k.term.toLowerCase();
            const noise = [job.company, p.company, job.location, p.location]
              .filter(Boolean)
              .map((x: any) => String(x).toLowerCase());
            return !noise.includes(t);
          })
          .slice(0, 20);

        /* The model often returns "Role — Company" in `role` and fills
           `company` too, which printed the employer twice. Split it once,
           here, so every renderer gets a clean pair. */
        const splitRole = (role: string, company: string) => {
          const r = String(role || "").trim();
          const c = String(company || "").trim();
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const parts = r.split(/\s+[—–-]\s+|\s+at\s+/i);
          if (parts.length >= 2) {
            const tail = parts[parts.length - 1].trim();
            const head = parts.slice(0, -1).join(" — ").trim();
            if (head && (!c || norm(tail) === norm(c) || norm(c).includes(norm(tail)) || norm(tail).includes(norm(c)))) {
              return { role: head, company: c || tail };
            }
          }
          return { role: r, company: c };
        };

        const experience = arr(parsed.experience)
          .map((r: any) => {
            const pair = splitRole(str(r?.role), str(r?.company));
            return {
              role: pair.role,
              company: pair.company,
              dates: str(r?.dates),
              location: str(r?.location),
              lines: arr(r?.lines).map(str).filter(Boolean).slice(0, 6),
            };
          })
          .filter((r: any) => r.role && r.lines.length)
          .slice(0, 10);

        const skillsRaw = arr(parsed.skills)
          .map((g: any) => ({
            group: str(g?.group),
            items: arr(g?.items).map(str).filter(Boolean).slice(0, 20),
          }))
          .filter((g: any) => g.items.length)
          .slice(0, 8);

        /* A skill the master resume does not show must not reach the printed
           CV. The model rephrases and occasionally adds a term from the
           posting; keep only what the resume text proves, and report the rest
           so the drawer can say what was removed. */
        const skillsDropped: string[] = [];
        const skills = skillsRaw
          .map((g: any) => {
            const kept = g.items.filter((it: string) => appearsIn(resume, it));
            for (const it of g.items) if (!kept.includes(it)) skillsDropped.push(it);
            return { ...g, items: kept };
          })
          .filter((g: any) => g.items.length);

        const projects = arr(parsed.projects)
          .map((x: any) => ({
            name: str(x?.name),
            lines: arr(x?.lines).map(str).filter(Boolean).slice(0, 4),
          }))
          .filter((x: any) => x.name)
          .slice(0, 8);

        const education = arr(parsed.education)
          .map((e: any) => ({
            degree: str(e?.degree),
            school: str(e?.school),
            dates: str(e?.dates),
            detail: str(e?.detail),
          }))
          .filter((e: any) => e.degree || e.school)
          .slice(0, 6);

        /* The master resume prints each certification on two lines: the name,
           then the issuer and year. The model sometimes returns both as two
           certifications, which duplicates them in the CV. Fold the issuer
           line into the name. */
        const rawCerts = arr(parsed.certifications).map(str).filter(Boolean);
        const certifications: string[] = [];
        for (const c of rawCerts) {
          /* a specialization is part of a degree, not a certification */
          if (/speciali[sz]ation/i.test(c)) continue;
          const prev = certifications[certifications.length - 1];
          if (prev && /·/.test(c) && !/·/.test(prev)) {
            certifications[certifications.length - 1] = `${prev} — ${c}`;
          } else {
            certifications.push(c);
          }
        }
        certifications.splice(10);
        /* the model sometimes returns {language, level} objects. Flatten them
           here so the renderer never prints "[object Object]". */
        const langText = (v: any): string => {
          if (v == null) return "";
          if (typeof v === "string") return v.trim();
          if (typeof v === "object") {
            const name = str(v.language ?? v.name ?? v.lang ?? v.value ?? "");
            const level = str(v.level ?? v.proficiency ?? v.fluency ?? "");
            if (name && level) return `${name} — ${level}`;
            return name || level;
          }
          return String(v).trim();
        };
        const languages = arr(parsed.languages).map(langText).filter(Boolean).slice(0, 8);

        /* the model sometimes repeats certifications inside education, or
           splits a specialization into its own row. Fold both back. */
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        const certTokens = new Set(certifications.flatMap((c) => norm(c).split(" ")).filter((w) => w.length > 3));
        const educationClean: typeof education = [];
        for (const e of education) {
          const deg = norm(e.degree);
          if (!deg) { educationClean.push({ ...e }); continue; }
          const hay = norm(`${e.degree} ${e.school} ${e.detail}`);
          const toks = deg.split(" ").filter((w) => w.length > 3);
          const hit = toks.filter((t) => certTokens.has(t)).length;
          const looksCert = /certif|skillbuild|learntube/.test(hay) || (toks.length > 0 && hit / toks.length >= 0.6);
          if (looksCert) {
            /* keep a specialization that the model split off from its degree */
            if (/speciali[sz]ation/i.test(e.degree) && educationClean.length) {
              const prev = educationClean[educationClean.length - 1];
              prev.detail = [prev.detail, e.degree].filter(Boolean).join(" · ");
              if (!prev.dates && e.dates) prev.dates = e.dates;
            }
            continue;
          }
          educationClean.push({ ...e });
        }

        /* merge rows that share a school (degree + specialization) */
        const mergedEducation: typeof education = [];
        for (const e of educationClean) {
          const key = norm(e.school);
          const prev = key ? mergedEducation.find((x) => norm(x.school) === key) : undefined;
          if (prev) {
            if (/speciali[sz]ation/i.test(e.degree)) {
              prev.detail = [prev.detail, e.degree].filter(Boolean).join(" · ");
            } else if (e.degree && !prev.degree.includes(e.degree)) {
              prev.degree = [prev.degree, e.degree].filter(Boolean).join(" · ");
            }
            if (!prev.dates && e.dates) prev.dates = e.dates;
            if (!prev.detail && e.detail) prev.detail = e.detail;
          } else {
            mergedEducation.push({ ...e });
          }
        }

        /* apply.html still reads the flat shape, so keep it in step */
        const bullets = experience.map((r: any) => ({ role: r.role, company: r.company, lines: r.lines }));
        const competencies = arr(parsed.competencies).map(str).filter(Boolean).slice(0, 8);
        const covered = keywords.filter((k: any) => k.inResume).length;

        /* The model sometimes slips a missing term into the summary anyway
           ("SQL-adjacent" when SQL is a gap). Flag it instead of hiding it. */
        const claimText = [
          str(parsed.summary),
          ...skills.flatMap((g: any) => g.items),
          ...experience.flatMap((r: any) => r.lines),
        ].join(" ");
        const claimsGaps = keywords
          .filter((k: any) => !k.inResume && mentions(claimText, k.term))
          .map((k: any) => k.term);

        /* Prove the "nothing invented" claim instead of asserting it: every
           employer, degree, certification and language in the answer must be
           visible in the master resume. */
        const verify = {
          roles: experience.map((r: any) => ({ label: r.company || r.role, kept: appearsIn(resume, r.company || r.role) })),
          education: mergedEducation.map((e: any) => ({ label: e.degree || e.school, kept: appearsIn(resume, `${e.degree} ${e.school}`) })),
          certifications: certifications.map((c: string) => ({ label: c, kept: appearsIn(resume, c) })),
          languages: languages.map((l: string) => ({ label: l, kept: appearsIn(resume, l) })),
        };
        const invented = [
          ...verify.roles,
          ...verify.education,
          ...verify.certifications,
          ...verify.languages,
        ].filter((x) => !x.kept).map((x) => x.label);

        return send(res, 200, {
          ok: true,
          headline: str(parsed.headline) || p.title || "",
          summary: str(parsed.summary),
          summaryMode,
          summaryChanged: !summaryIssue,
          skills,
          skillsDropped,
          experience,
          projects,
          education: mergedEducation,
          certifications,
          languages,
          competencies: competencies.length ? competencies : skills.flatMap((g: any) => g.items).slice(0, 8),
          bullets,
          gaps: arr(parsed.gaps).map(str).filter(Boolean).slice(0, 6),
          keywords,
          highlights: (() => {
            const jdText = String(job.description || "");
            const headOf = (s: string) => {
              const t = s.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z0-9+#]+/).filter(Boolean);
              return t[t.length - 1] || "";
            };
            const skillHits = baseline.skills.filter((s) => {
              const head = headOf(s);
              return head.length > 3 && !GENERIC_HIGHLIGHT.has(head) && mentions(jdText, head);
            });
            const all = [
              ...keywords.filter((k: any) => k.inResume).map((k: any) => k.term),
              ...skillHits,
            ];
            return [...new Set(all)]
              .filter((t: string) => t && !GENERIC_HIGHLIGHT.has(t.toLowerCase()))
              .slice(0, 12);
          })(),
          coverage: keywords.length ? Math.round((covered / keywords.length) * 100) : 0,
          before: {
            summary: baseline.summary,
            skills: baseline.skills,
            roles: baseline.roles,
            certifications: baseline.certifications,
            languages: baseline.languages,
            bullets: baseline.bullets,
          },
          verify: { ...verify, invented },
          missingRoles: missing,
          missingFacts: missingFactList,
          claimsGaps,
          model: tailorModel,
          ms: Date.now() - t0,
        });
      } catch (e) {
        return send(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (path === "/api/job-detail" && req.method === "POST") {
      const b = (await body(req)) as {
        source?: string;
        jk?: string;
        job?: { id?: string; title?: string; company?: string; location?: string; sourceUrl?: string; datePosted?: string | null; firstSeenAt?: string; salary?: string };
        request?: JobRequest;
      };
      if (b.source !== "indeed") {
        return send(res, 200, { ok: false, reason: "unsupported", error: "Only Indeed needs a second read." });
      }
      const d = await fetchIndeedDetail(String(b.jk || ""), join(DATA, "browser-profile-indeed"));
      if (!d.ok || !d.description) return send(res, 200, d);

      const j = b.job ?? {};
      const job = {
        id: String(j.id || `indeed:${b.jk}`),
        sourceId: "indeed",
        sourceUrl: String(j.sourceUrl || `https://in.indeed.com/viewjob?jk=${b.jk}`),
        company: String(j.company || "Not stated"),
        title: String(j.title || ""),
        location: String(j.location || ""),
        country: "IN",
        description: d.description,
        ...(j.datePosted ? { datePosted: j.datePosted } : {}),
        firstSeenAt: String(j.firstSeenAt || new Date().toISOString()),
        status: "open" as const,
        ...(j.salary ? { salary: j.salary } : {}),
        ...(d.applyUrl ? { applyUrl: d.applyUrl } : {}),
      } as Job;

      const r = b.request ?? {};
      const scored = scoreOne(job, r, profileFor(r), prefsFor(r));
      return send(res, 200, { ...d, job: scored });
    }

    if (path === "/api/fill" && req.method === "POST") {
      const b = (await body(req)) as {
        url?: string;
        source?: string;
        profile?: {
          fullName?: string; email?: string; phone?: string; city?: string;
          linkedin?: string; website?: string; currentCompany?: string;
          currentTitle?: string; years?: number;
        };
      };
      const url = String(b.url || "");
      if (!/^https?:\/\//i.test(url)) {
        return send(res, 400, { ok: false, error: "A full http(s) URL is required." });
      }
      /* Trust the host, not the label: Indeed hands most applications to the
         employer, so the source can be "indeed" while the form is Lever. */
      let host = "";
      try { host = new URL(url).hostname; } catch { host = ""; }
      const ATS_HOST = /(^|\.)(lever\.co|greenhouse\.io|ashbyhq\.com|smartrecruiters\.com)$/i;
      const fillable = ATS_HOST.test(host) || FILLABLE_SOURCES.includes(String(b.source) as any);
      if (!fillable) {
        return send(res, 200, {
          ok: false,
          reason: "not-fillable",
          error: "This source has no form we can fill. Open the posting and type the fields yourself.",
        });
      }
      const r = await fillApplication({
        url,
        profileDir: join(DATA, "browser-profile"),
        profile: b.profile ?? {},
        dataDir: DATA,
      });
      return send(res, 200, r);
    }

    if (path === "/api/fill/close" && req.method === "POST") {
      await closeFillWindow();
      return send(res, 200, { ok: true });
    }

    /* ---------------- tailored resume store ---------------- */

    if (path === "/api/tailored/save" && req.method === "POST") {
      const b = (await body(req)) as { jobId?: string; data?: any; html?: string };
      const jobId = String(b.jobId || "");
      if (!jobId) return send(res, 400, { ok: false, error: "jobId is required." });
      if (!b.html || String(b.html).length < 200) {
        return send(res, 400, { ok: false, error: "The resume HTML is missing." });
      }
      try {
        const rec = await saveTailored(ROOT, jobId, b.data ?? {}, String(b.html));
        return send(res, 200, { ok: true, jobId: rec.jobId, pdf: rec.pdf, pdfSha256: rec.pdfSha256, savedAt: rec.savedAt });
      } catch (e) {
        return send(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (path.startsWith("/api/tailored/") && req.method === "GET") {
      const id = decodeURIComponent(path.slice("/api/tailored/".length));
      const rec = await loadTailored(ROOT, id);
      if (!rec) return send(res, 200, { ok: false, exists: false });
      return send(res, 200, { ok: true, exists: true, jobId: rec.jobId, savedAt: rec.savedAt, data: rec.data, pdf: rec.pdf });
    }

    /* ---------------- auto apply ---------------- */

    if (path === "/api/autoapply/start" && req.method === "POST") {
      const b = (await body(req)) as {
        jobs?: any[];
        mode?: string;
        cap?: number;
        profile?: any;
      };
      const jobs = Array.isArray(b.jobs) ? b.jobs : [];
      const mode = b.mode === "submit" ? "submit" : "fill";
      /* The console sends `name` and `location`; an MCP client sends
         `fullName` and `city`. Accept both, or the most basic fields get
         asked back to the user as if the profile were empty. */
      const p = (b.profile ?? {}) as Record<string, any>;
      const profile = {
        ...p,
        fullName: p.fullName || p.name || "",
        city: p.city || p.location || "",
        currentCompany: p.currentCompany || p.company || "",
        currentTitle: p.currentTitle || p.title || "",
      };
      const r = await startQueue({
        root: ROOT,
        profileDir: join(DATA, "browser-profile"),
        profile,
        jobs,
        mode,
        cap: b.cap,
      });
      return send(res, 200, r);
    }

    if (path === "/api/autoapply/status" && req.method === "GET") {
      return send(res, 200, { ok: true, state: queueState() });
    }

    if (path === "/api/autoapply/stop" && req.method === "POST") {
      const st = await stopQueue();
      return send(res, 200, { ok: true, state: st });
    }

    if (path === "/api/autoapply/resume" && req.method === "POST") {
      const r = await resumeQueue();
      return send(res, 200, r);
    }

    /* The console's answer box. The run is waiting on this id; the value is
       typed into the field the agent asked about and the run continues. */
    if (path === "/api/autoapply/answer" && req.method === "POST") {
      const b = (await body(req)) as { id?: string; value?: string };
      if (!b.id) return send(res, 400, { ok: false, error: "id is required" });
      const r = answerAsk(String(b.id), String(b.value ?? ""));
      return send(res, r.ok ? 200 : 409, { ...r, state: queueState() });
    }

    if (path === "/api/autoapply/retry" && req.method === "POST") {
      const b = (await body(req)) as { id?: string };
      const r = b.id ? await retryJob(String(b.id)) : await resumeQueue();
      return send(res, r.ok ? 200 : 409, r);
    }

    /* Live queue + open questions. The console holds this open with
       EventSource; an MCP client can poll /status instead. */
    if (path === "/api/autoapply/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const write = (s: unknown) => {
        try {
          res.write(`data: ${JSON.stringify(s)}\n\n`);
        } catch {
          /* client went away */
        }
      };
      write({ ...queueState(), asks: askState() });
      const off = subscribeQueue((s) => write({ ...s, asks: askState() }));
      const beat = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          /* ignore */
        }
      }, 15_000);
      if (typeof beat.unref === "function") beat.unref();
      req.on("close", () => {
        clearInterval(beat);
        off();
      });
      return;
    }

    /* ---------------- master resume + target role ---------------- */
    /* Shared by the console, the workspace and an MCP client, so a resume
       uploaded once is visible everywhere. Local file, never uploaded. */

    if (path === "/api/resume" && req.method === "GET") {
      const rec = await getResume(ROOT);
      return send(res, 200, rec ? { ok: true, exists: true, ...rec } : { ok: true, exists: false });
    }

    if (path === "/api/resume" && req.method === "POST") {
      const b = (await body(req)) as { text?: string; file?: string };
      const text = String(b.text || "");
      if (text.trim().length < 60) {
        return send(res, 400, { ok: false, error: "That resume text is too short to use." });
      }
      const rec = await saveResume(ROOT, text, b.file ? String(b.file) : undefined);
      return send(res, 200, { ok: true, ...rec });
    }

    if (path === "/api/profile" && req.method === "GET") {
      return send(res, 200, { ok: true, ...(await getProfile(ROOT)) });
    }

    if (path === "/api/profile" && req.method === "POST") {
      const b = (await body(req)) as { role?: string; years?: number | string; details?: any };
      const p = await saveProfile(ROOT, {
        ...(b.role !== undefined ? { role: String(b.role) } : {}),
        ...(b.years !== undefined ? { years: b.years } : {}),
        ...(b.details && typeof b.details === "object" ? { details: b.details } : {}),
      });
      return send(res, 200, { ok: true, ...p });
    }

    /* ---------------- site memory ---------------- */

    if (path === "/api/sites" && req.method === "GET") {
      return send(res, 200, { ok: true, sites: await listSites(DATA) });
    }

    if (path === "/api/sites" && req.method === "DELETE") {
      const b = (await body(req)) as { host?: string };
      if (!b.host) return send(res, 400, { ok: false, error: "host is required" });
      return send(res, 200, { ok: true, removed: await forgetSite(DATA, String(b.host)) });
    }

    /* ---------------- market funnel ---------------- */

    if (path === "/api/market/summary" && req.method === "POST") {
      const b = (await body(req)) as {
        role?: string;
        state?: string;
        city?: string;
        remote?: boolean;
        limit?: number;
        jobs?: any[];
      };
      const jobs = Array.isArray(b.jobs) ? (b.jobs as ScoredJob[]) : [];
      return send(
        res,
        200,
        {
          ok: true,
          ...marketSummary(jobs, {
            role: String(b.role || ""),
            state: b.state ? String(b.state) : undefined,
            city: b.city ? String(b.city) : undefined,
            remote: Boolean(b.remote),
            limit: b.limit,
          }),
        }
      );
    }

    /* ---------------- Naukri API (no browser) ---------------- */
    /* Naukri's own internal endpoints. Free, no key, but undocumented, so the
       browser connector stays as the fallback. The session is a token on disk,
       never a password. */

    if (path === "/api/naukri/status" && req.method === "GET") {
      await naukriLoad(DATA);
      return send(res, 200, { ...naukriStatus(), policy: NAUKRI_API_POLICY });
    }

    if (path === "/api/naukri/login" && req.method === "POST") {
      const b = (await body(req)) as { username?: string; password?: string };
      const username = String(b.username || "").trim();
      const password = String(b.password || "");
      if (!username || !password) {
        return send(res, 400, { ok: false, message: "Email (or phone) and password are both required." });
      }
      try {
        const r = await naukriLogin(DATA, username, password);
        return send(res, 200, r);
      } catch (e) {
        const err = e instanceof NaukriApiError ? e : null;
        return send(res, 200, {
          ok: false,
          kind: err?.kind ?? "network",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    /* Borrow the sign-in the user already did in the browser panel. This is
       the path that works without a password or a captcha. */
    if (path === "/api/naukri/import" && req.method === "POST") {
      try {
        const r = await naukriImport(DATA, join(DATA, "browser-profile"));
        return send(res, 200, r);
      } catch (e) {
        const err = e instanceof NaukriApiError ? e : null;
        return send(res, 200, {
          ok: false,
          kind: err?.kind ?? "network",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (path === "/api/naukri/otp" && req.method === "POST") {
      const b = (await body(req)) as { otp?: string; username?: string; isMobile?: boolean; resend?: boolean };
      try {
        if (b.resend) {
          const username = String(b.username || "").trim();
          if (!username) return send(res, 400, { ok: false, message: "No account to resend to." });
          await naukriSendOtp(username, b.isMobile ?? true);
          return send(res, 200, { ok: true, message: "A new code was sent." });
        }
        const otp = String(b.otp || "").replace(/\D/g, "");
        if (otp.length < 4) return send(res, 400, { ok: false, message: "Enter the code Naukri sent." });
        const r = await naukriVerifyOtp(DATA, otp, b.username, b.isMobile);
        return send(res, 200, r);
      } catch (e) {
        const err = e instanceof NaukriApiError ? e : null;
        return send(res, 200, {
          ok: false,
          kind: err?.kind ?? "network",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (path === "/api/naukri/logout" && req.method === "POST") {
      await naukriLogout(DATA);
      return send(res, 200, { ok: true });
    }

    if (path === "/api/naukri/search" && req.method === "POST") {
      const b = (await body(req)) as { role?: string; city?: string; limit?: number; jobAge?: number; page?: number };
      const role = String(b.role || "").trim();
      if (!role) return send(res, 400, { ok: false, message: "A role is required." });
      try {
        const r = await naukriSearch({
          role,
          ...(b.city ? { city: String(b.city) } : {}),
          ...(b.limit ? { limit: Number(b.limit) } : {}),
          ...(b.jobAge ? { jobAge: Number(b.jobAge) } : {}),
          ...(b.page ? { page: Number(b.page) } : {}),
        });
        return send(res, 200, { ok: true, ...r });
      } catch (e) {
        const err = e instanceof NaukriApiError ? e : null;
        return send(res, 200, {
          ok: false,
          kind: err?.kind ?? "network",
          message: e instanceof Error ? e.message : String(e),
          fallback: "browser",
        });
      }
    }

    if (path === "/api/naukri/apply" && req.method === "POST") {
      const b = (await body(req)) as {
        jobId?: string;
        title?: string;
        company?: string;
        source?: "search" | "recommended";
      };
      const jobId = String(b.jobId || "");
      if (!jobId) return send(res, 400, { ok: false, message: "No job id." });

      /* The cap is checked before any network call, so a blocked run costs
         nothing and never half-applies. */
      let cap;
      try {
        cap = await assertCanApply(DATA);
      } catch (e) {
        return send(res, 200, {
          ok: false,
          capped: true,
          message: e instanceof Error ? e.message : String(e),
          cap: await capState(DATA),
        });
      }

      try {
        const r = await naukriApply(jobId, { ...(b.source ? { source: b.source } : {}) });
        await recordApply(DATA, {
          jobId,
          title: String(b.title || ""),
          company: String(b.company || ""),
          source: "naukri",
          ok: r.ok,
          ...(r.message ? { message: r.message } : {}),
          via: "api",
        });
        return send(res, 200, { ...r, cap: await capState(DATA) });
      } catch (e) {
        const err = e instanceof NaukriApiError ? e : null;
        await recordApply(DATA, {
          jobId,
          title: String(b.title || ""),
          company: String(b.company || ""),
          source: "naukri",
          ok: false,
          message: e instanceof Error ? e.message : String(e),
          via: "api",
        });
        return send(res, 200, {
          ok: false,
          kind: err?.kind ?? "network",
          message: e instanceof Error ? e.message : String(e),
          cap: await capState(DATA),
        });
      }
    }

    if (path === "/api/naukri/history" && req.method === "GET") {
      try {
        const rows = await naukriHistory();
        return send(res, 200, { ok: true, rows });
      } catch (e) {
        return send(res, 200, { ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }

    /* ---------------- audit log + daily cap ---------------- */

    if (path === "/api/audit" && req.method === "GET") {
      const [entries, cap] = await Promise.all([readAudit(DATA), capState(DATA)]);
      return send(res, 200, { ok: true, entries, cap });
    }

    if (path === "/api/audit" && req.method === "POST") {
      const b = (await body(req)) as {
        jobId?: string; title?: string; company?: string; source?: string;
        resume?: string; ok?: boolean; message?: string; via?: "api" | "browser" | "manual";
      };
      const entry = await recordApply(DATA, {
        jobId: String(b.jobId || ""),
        title: String(b.title || ""),
        company: String(b.company || ""),
        source: String(b.source || ""),
        ...(b.resume ? { resume: String(b.resume) } : {}),
        ok: Boolean(b.ok),
        ...(b.message ? { message: String(b.message) } : {}),
        via: b.via ?? "manual",
      });
      return send(res, 200, { ok: true, entry, cap: await capState(DATA) });
    }

    if (path === "/api/cap" && req.method === "GET") {
      return send(res, 200, { ok: true, ...(await capState(DATA)) });
    }

    /* ---------------- per-site form cache ---------------- */

    if (path === "/api/forms" && req.method === "GET") {
      return send(res, 200, { ok: true, hosts: await cacheSummary(DATA) });
    }

    if (path === "/api/forms" && req.method === "DELETE") {
      const b = (await body(req)) as { host?: string };
      if (!b.host) return send(res, 400, { ok: false, error: "host is required" });
      const removed = await forgetForm(DATA, b.host);
      return send(res, 200, { ok: true, removed });
    }

    /* ---------------- ATS keyword gap ---------------- */

    if (path === "/api/ats/gap" && req.method === "POST") {
      const b = (await body(req)) as { resume?: string; jd?: string };
      const resume = String(b.resume || "");
      const jd = String(b.jd || "");
      if (!jd.trim()) return send(res, 400, { ok: false, message: "Paste the job description." });
      return send(res, 200, { ok: true, ...keywordGap(resume, jd) });
    }

    /* ---------------- embedded browser ---------------- */
    /* One Chrome, owned by the server, streamed into the app. The window is
       real and headed (Cloudflare and Akamai both refuse headless) but parked
       off-screen, so the user works inside Career-Ops instead of a stray
       window. Sign in once here and every connector reuses the session. */

    if (path === "/api/browser/status" && req.method === "GET") {
      const p = currentPage();
      const state = p ? await pageState() : null;
      return send(res, 200, {
        hasChrome: HAS_CHROME,
        open: Boolean(p),
        paused: isPaused(),
        url: p ? p.url() : null,
        title: p ? await p.title().catch(() => "") : null,
        pageState: state,
      });
    }

    if (path === "/api/browser/control" && req.method === "POST") {
      const b = (await body(req)) as { paused?: boolean };
      setPaused(Boolean(b.paused));
      return send(res, 200, { ok: true, paused: isPaused() });
    }

    if (path === "/api/browser/open" && req.method === "POST") {
      const b = (await body(req)) as { url?: string; profile?: string };
      const url = String(b.url || "https://www.naukri.com/");
      if (!/^https?:\/\//i.test(url)) {
        return send(res, 400, { ok: false, error: "A full http(s) URL is required." });
      }
      const profile = b.profile === "indeed" ? join(DATA, "browser-profile-indeed") : join(DATA, "browser-profile");
      const r = await openVisible(profile, url);
      return send(res, 200, r);
    }

    if (path === "/api/browser/frame" && req.method === "GET") {
      const jpeg = await frame();
      if (!jpeg) {
        res.writeHead(204, { "cache-control": "no-store" });
        return res.end();
      }
      res.writeHead(200, {
        "content-type": "image/jpeg",
        "cache-control": "no-store, no-cache, must-revalidate",
        "content-length": jpeg.length,
      });
      return res.end(jpeg);
    }

    if (path === "/api/browser/input" && req.method === "POST") {
      const b = (await body(req)) as Record<string, unknown>;
      const r = await sendInput(b as never);
      return send(res, 200, r);
    }

    if (path === "/api/browser/navigate" && req.method === "POST") {
      const b = (await body(req)) as { url?: string };
      const url = String(b.url || "");
      if (!/^https?:\/\//i.test(url)) {
        return send(res, 400, { ok: false, error: "A full http(s) URL is required." });
      }
      return send(res, 200, await navigate(url));
    }

    if (path === "/api/browser/back" && req.method === "POST") {
      return send(res, 200, await back());
    }

    if (path === "/api/browser/close" && req.method === "POST") {
      await closeBrowser();
      return send(res, 200, { ok: true });
    }

    if (path === "/api/ai/test" && req.method === "POST") {
      const s = await loadSettings();
      const sec = await loadSecrets();
      if (s.provider === "none") return send(res, 200, { ok: true, mode: "deterministic", message: "No AI configured. Scoring still works." });
      if (!sec.apiKey) return send(res, 400, { ok: false, error: "No key stored for this provider." });

      const t0 = Date.now();
      try {
        const r = await fetch(`${s.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${sec.apiKey}` },
          body: JSON.stringify({
            model: s.model,
            messages: [{ role: "user", content: "Reply with the single word: ok" }],
            max_tokens: 8,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const text = await r.text();
        if (!r.ok) {
          /* Sarvam answers a bad model name with the list of valid ones.
             Surface that instead of a wall of JSON. */
          let hint: string | undefined;
          try {
            const j = JSON.parse(text);
            const msg = String(j?.error?.message ?? "");
            const allowed = msg.match(/should be one of ([^.]+)/i)?.[1];
            if (allowed) hint = `This provider does not accept "${s.model}". Use one of: ${allowed.trim()}.`;
            else if (msg) hint = msg.slice(0, 240);
          } catch {
            /* not JSON */
          }
          return send(res, 200, {
            ok: false,
            status: r.status,
            error: text.slice(0, 300),
            ...(hint ? { hint } : {}),
            ms: Date.now() - t0,
          });
        }
        return send(res, 200, { ok: true, status: r.status, ms: Date.now() - t0, sample: text.slice(0, 200) });
      } catch (e) {
        return send(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 });
      }
    }

    /* ---------------- static ---------------- */

    let file = path === "/" ? "/index.html" : path;
    const full = normalize(join(UI, file));
    if (!full.startsWith(normalize(UI))) return send(res, 403, "Forbidden", "text/plain");
    if (!existsSync(full)) return send(res, 404, "Not found", "text/plain");

    const buf = await readFile(full);
    res.writeHead(200, {
      "content-type": TYPES[extname(full)] ?? "application/octet-stream",
      "cache-control": "no-store, must-revalidate",
    });
    res.end(buf);
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`career-ops india on http://localhost:${PORT}`);
  console.log(
    `  ${BOARDS.length + COMPANY_PORTALS.length + (process.env.CAREER_OPS_WORKDAY === "1" ? WORKDAY_PORTALS.length : 0)} connectors, ${Object.keys(PROVIDERS).length} AI providers`,
  );
  /* Warm every board now, so the first page load is not the warm-up. */
  warmBoards();
  for (const p of COMPANY_PORTALS) void runCompanyPortal(p).catch(() => {});
});
