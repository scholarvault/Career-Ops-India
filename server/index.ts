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
import { REMOTE_SOURCES, runRemote } from "./connectors/remote";
import { discoverFreelance } from "./connectors/freelance";
import { fillApplication, closeFillWindow, FILLABLE_SOURCES } from "./connectors/fill";
import { fetchIndeedDetail } from "./connectors/indeed";
import {
  HAS_CHROME,
  back,
  closeBrowser,
  currentPage,
  frame,
  navigate,
  openVisible,
  sendInput,
} from "./lib/browser";

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
  res.writeHead(status, { "content-type": type, "cache-control": "no-store, must-revalidate" });
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
      return send(res, 200, result);
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
      const resume = String(b.resumeText || "").slice(0, 8000);

      const prompt = [
        "You are tailoring an existing resume to one job posting. You are not writing a new resume.",
        "",
        "HARD RULES",
        "1. Never invent an employer, job title, date, degree, certification, metric or skill.",
        "2. Only rephrase, reorder and select what is already in the resume text below.",
        "3. Every number you write must already appear in the resume. If none is there, write none.",
        "4. If the posting asks for something the resume does not show, put it in gaps. Do not add it.",
        "5. Plain text only. No markdown, no asterisks, no emoji.",
        "",
        `JOB: ${job.title || ""} at ${job.company || ""} (${job.location || "location not stated"})`,
        "JOB DESCRIPTION:",
        String(job.description || "").slice(0, 4000),
        "",
        `CANDIDATE: ${p.name || ""} | ${p.title || ""} at ${p.company || ""} | ${p.years ?? "?"} years | ${p.location || ""}`,
        `CANDIDATE SKILLS: ${(p.skills ?? []).join(", ") || "not stated"}`,
        "",
        "RESUME TEXT:",
        resume || "(no resume text supplied)",
        "",
        "Return ONE JSON object and nothing else, in this exact shape:",
        `{"keywords":[{"term":"exact phrase from the posting","inResume":true}],` +
          `"summary":"3 sentences, first person implied, keyword-dense, no invented facts",` +
          `"competencies":["6 to 8 short phrases taken from the posting that the resume supports"],` +
          `"bullets":[{"role":"title from the resume","company":"employer from the resume","lines":["rewritten bullet, max 4 per role"]}],` +
          `"gaps":["what the posting asks for that the resume does not show"]}`,
        "",
        "keywords: 12 to 15 of the most important phrases in the posting. inResume is true only if the resume already shows it.",
        "bullets: use only roles that appear in the resume, most relevant first, at most 3 bullets each.",
        "Keep the whole answer under 900 words.",
        "Your entire reply is that one JSON object. No checklist, no commentary, no second copy, no chat tokens.",
      ].join("\n");

      const t0 = Date.now();
      try {
        /* sarvam-105b is a reasoning model: on a long structured prompt it
           spends the whole token budget on reasoning_content and returns an
           empty message (finish_reason "length"). The conversations variant
           answers the same JSON in under a second with no reasoning. */
        const tailorModel = s.model === "sarvam-105b" ? "sarvam-105b-conversations" : s.model;
        const r = await fetch(`${s.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${sec.apiKey}` },
          body: JSON.stringify({
            model: tailorModel,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 6000,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(90000),
        });
        const text = await r.text();
        if (!r.ok) {
          return send(res, 200, { ok: false, status: r.status, error: text.slice(0, 240) });
        }
        const j = JSON.parse(text);
        const out = String(j?.choices?.[0]?.message?.content ?? "").trim();
        if (!out) {
          return send(res, 200, {
            ok: false,
            reason: "empty",
            finish: j?.choices?.[0]?.finish_reason,
            error: "The model returned no text.",
          });
        }

        /* the model sometimes wraps JSON in a fence, adds a sentence, or is
           cut off by the token limit. Take the last object that parses. */
        let parsed = pickJson(out);
        if (!parsed) {
          const a = out.indexOf("{");
          if (a >= 0) {
            try {
              parsed = JSON.parse(repairJson(out.slice(a)));
            } catch {
              parsed = null;
            }
          }
        }
        if (!parsed) {
          console.error("[tailor] unparseable model output:", out.slice(0, 400));
          return send(res, 200, { ok: false, reason: "not-json", error: "Sarvam returned an incomplete answer. Try again." });
        }

        const keywords = Array.isArray(parsed.keywords)
          ? parsed.keywords
              .map((k: any) => ({ term: String(k?.term ?? "").trim(), inResume: Boolean(k?.inResume) }))
              .filter((k: any) => k.term)
              /* an employer or a city is not a keyword the candidate can show */
              .filter((k: any) => {
                const t = k.term.toLowerCase();
                const noise = [job.company, p.company, job.location, p.location]
                  .filter(Boolean)
                  .map((x: any) => String(x).toLowerCase());
                return !noise.includes(t);
              })
              .slice(0, 20)
          : [];
        const bullets = Array.isArray(parsed.bullets)
          ? parsed.bullets
              .map((r: any) => ({
                role: String(r?.role ?? "").trim(),
                company: String(r?.company ?? "").trim(),
                lines: Array.isArray(r?.lines) ? r.lines.map((l: any) => String(l).trim()).filter(Boolean).slice(0, 4) : [],
              }))
              .filter((r: any) => r.role && r.lines.length)
              .slice(0, 6)
          : [];
        const covered = keywords.filter((k: any) => k.inResume).length;

        return send(res, 200, {
          ok: true,
          summary: String(parsed.summary ?? "").trim(),
          competencies: Array.isArray(parsed.competencies)
            ? parsed.competencies.map((c: any) => String(c).trim()).filter(Boolean).slice(0, 8)
            : [],
          bullets,
          gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map((g: any) => String(g).trim()).filter(Boolean).slice(0, 6) : [],
          keywords,
          coverage: keywords.length ? Math.round((covered / keywords.length) * 100) : 0,
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
      });
      return send(res, 200, r);
    }

    if (path === "/api/fill/close" && req.method === "POST") {
      await closeFillWindow();
      return send(res, 200, { ok: true });
    }

    /* ---------------- embedded browser ---------------- */
    /* One Chrome, owned by the server, streamed into the app. The window is
       real and headed (Cloudflare and Akamai both refuse headless) but parked
       off-screen, so the user works inside Career-Ops instead of a stray
       window. Sign in once here and every connector reuses the session. */

    if (path === "/api/browser/status" && req.method === "GET") {
      const p = currentPage();
      return send(res, 200, {
        hasChrome: HAS_CHROME,
        open: Boolean(p),
        url: p ? p.url() : null,
        title: p ? await p.title().catch(() => "") : null,
      });
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
  console.log(`  ${BOARDS.length} connectors, ${Object.keys(PROVIDERS).length} AI providers`);
  /* Warm every board now, so the first page load is not the warm-up. */
  warmBoards();
});
