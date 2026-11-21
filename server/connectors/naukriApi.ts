// Naukri API connector.
//
// Naukri's own web client talks to these endpoints. There is no paid API and
// no key to buy — the "cost" is that they are undocumented and can change, so
// every call is wrapped and the browser connector stays as the fallback.
//
// Two things make this work from a laptop and fail from a server:
//   - nkparam, an RSA-signed header the frontend mints per request
//   - the IP. Naukri MFA-blocks datacenter ranges; home broadband is fine.
// That is exactly the shape of a local-first app, which is why this belongs
// here and not in a hosted service.
//
// What it never does: read a password from disk, log a token, or retry a
// failed login. A wrong password is reported, not hammered.

import { createPublicKey, publicEncrypt, constants } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Job } from "@career-ops/contracts";
import { readCookies as readBrowserCookies } from "../lib/browser";

const BASE = "https://www.naukri.com";

const LOGIN_URL = `${BASE}/central-login-services/v1/login`;
const OTP_SEND_URL = `${BASE}/central-login-services/v1/otp`;
const OTP_VERIFY_URL = `${BASE}/central-login-services/v0/otp-login`;
const SEARCH_URL = `${BASE}/jobapi/v3/search`;
const APPLY_URL = `${BASE}/cloudgateway-workflow/workflow-services/apply-workflow/v1/apply`;
const HISTORY_URL = `${BASE}/cloudgateway-apply/whtma-services/v0/applyapi/v5/history`;

/** Published in Naukri's own frontend bundle. Used only to sign nkparam. */
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALrlQ+djR0RjJwBF1xuisHmdFv334MIm
K6LgzJhmLhN7B5yuEyaKoasgXQk3+OQglsOaBxEJ0j5PcTL3nbOvt80CAwEAAQ==
-----END PUBLIC KEY-----`;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

export type NaukriErrorKind =
  | "auth"
  | "otp"
  | "recaptcha"
  | "network"
  | "parse"
  | "blocked";

export class NaukriApiError extends Error {
  kind: NaukriErrorKind;
  status?: number;
  constructor(kind: NaukriErrorKind, message: string, status?: number) {
    super(message);
    this.name = "NaukriApiError";
    this.kind = kind;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* nkparam                                                             */
/* ------------------------------------------------------------------ */

/**
 * The search endpoint rejects a request without this header. The frontend
 * builds `v0|<ms>|121_<page>` and RSA-encrypts it with the public key above.
 * `page` is "srp" for search and the job id for a job detail page.
 */
export function nkparam(page: string = "srp"): string {
  const plain = `v0|${Date.now()}|121_${page}`;
  const key = createPublicKey(PUBLIC_KEY);
  const enc = publicEncrypt(
    { key, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(plain, "utf8"),
  );
  return enc.toString("base64");
}

/* ------------------------------------------------------------------ */
/* session                                                             */
/* ------------------------------------------------------------------ */

export type NaukriSession = {
  /** Bearer token, also sent as the nauk_at cookie. */
  token: string;
  /** Refresh token when Naukri issued one. */
  refresh?: string;
  savedAt: string;
};

export type NaukriStatus = {
  signedIn: boolean;
  savedAt?: string;
  /** True when a password login came back without a token and an OTP is due. */
  otpPending: boolean;
  username?: string;
};

let session: NaukriSession | null = null;
let otpPending: { username: string; isMobile: boolean } | null = null;

function sessionPath(dataDir: string): string {
  return join(dataDir, "naukri-session.json");
}

export async function loadSession(dataDir: string): Promise<NaukriSession | null> {
  if (session) return session;
  try {
    const raw = await readFile(sessionPath(dataDir), "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as NaukriSession;
    if (parsed && typeof parsed.token === "string" && parsed.token) {
      session = parsed;
      return session;
    }
  } catch {
    /* no session yet — not an error */
  }
  return null;
}

async function saveSession(dataDir: string, next: NaukriSession): Promise<void> {
  session = next;
  await mkdir(dirname(sessionPath(dataDir)), { recursive: true });
  await writeFile(sessionPath(dataDir), JSON.stringify(next, null, 2), { mode: 0o600 });
}

export async function clearSession(dataDir: string): Promise<void> {
  session = null;
  otpPending = null;
  await rm(sessionPath(dataDir), { force: true });
}

export function status(): NaukriStatus {
  return {
    signedIn: Boolean(session?.token),
    ...(session?.savedAt ? { savedAt: session.savedAt } : {}),
    otpPending: Boolean(otpPending),
    ...(otpPending ? { username: otpPending.username } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* http                                                                */
/* ------------------------------------------------------------------ */

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    accept: "application/json",
    appid: "103",
    clientid: "d3skt0p",
    "content-type": "application/json",
    referer: `${BASE}/`,
    systemid: "jobseeker",
    "x-requested-with": "XMLHttpRequest",
    "user-agent": UA,
    ...extra,
  };
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!session?.token) throw new NaukriApiError("auth", "Not signed in to Naukri.");
  return baseHeaders({
    authorization: `Bearer ${session.token}`,
    systemid: "Naukri",
    ...extra,
  });
}

/** Pull nauk_at / nauk_rt out of a response, whichever way it was sent. */
function readCookies(res: Response): { token?: string; refresh?: string } {
  const jar = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const raw = jar.length ? jar : [res.headers.get("set-cookie") || ""];
  let token: string | undefined;
  let refresh: string | undefined;
  for (const line of raw) {
    if (!line) continue;
    const m = line.match(/(?:^|,\s*)(nauk_at|nauk_rt)=([^;]+)/);
    if (!m) continue;
    if (m[1] === "nauk_at") token = decodeURIComponent(m[2]);
    if (m[1] === "nauk_rt") refresh = decodeURIComponent(m[2]);
  }
  return { token, refresh };
}

async function call(
  url: string,
  init: RequestInit,
  opts: { authIsData?: boolean } = {},
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, redirect: "follow" });
  } catch (e) {
    throw new NaukriApiError(
      "network",
      `Could not reach Naukri: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  /* On a login call a 401 means "wrong password", not "session expired", and
     the caller needs the body to say so. Everywhere else it is a dead token. */
  if (!opts.authIsData && (res.status === 401 || res.status === 403)) {
    throw new NaukriApiError("auth", "Naukri rejected the session. Sign in again.", res.status);
  }
  if (res.status === 406) {
    const body = await res.text().catch(() => "");
    if (/recaptcha/i.test(body)) {
      throw new NaukriApiError(
        "recaptcha",
        "Naukri asked for a reCAPTCHA. Wait a minute, or use the browser panel once.",
        406,
      );
    }
    throw new NaukriApiError("blocked", "Naukri refused the request (406).", 406);
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* login                                                               */
/* ------------------------------------------------------------------ */

export type LoginResult = {
  ok: boolean;
  needsOtp?: boolean;
  message?: string;
};

/**
 * Password login. Naukri answers with a token cookie on a clean login, and
 * with an OTP challenge when it wants a second factor. We never guess which:
 * no token means an OTP is due.
 */
export async function login(
  dataDir: string,
  username: string,
  password: string,
): Promise<LoginResult> {
  const res = await call(
    LOGIN_URL,
    {
      method: "POST",
      headers: baseHeaders({ appid: "105", systemid: "jobseeker" }),
      body: JSON.stringify({ username, password }),
    },
    { authIsData: true },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    /* Naukri answers a bad password with 401 and a field error. Say that,
       instead of the generic "session rejected" a dead token gets. */
    if (res.status === 401 || res.status === 400) {
      const invalid = /invalid credentials/i.test(text);
      return {
        ok: false,
        message: invalid
          ? "Naukri did not accept that email and password. If you normally sign in with an OTP, use the browser panel once and then “Use the browser session”."
          : "Naukri did not accept that sign-in. Check the email and password.",
      };
    }
    return {
      ok: false,
      message: `Login failed (${res.status}). ${text.slice(0, 120)}`,
    };
  }

  const { token, refresh } = readCookies(res);
  if (token) {
    await saveSession(dataDir, {
      token,
      ...(refresh ? { refresh } : {}),
      savedAt: new Date().toISOString(),
    });
    otpPending = null;
    return { ok: true };
  }

  /* No token: Naukri wants an OTP. Ask it to send one now so the user is not
     left waiting on a screen that says "check your phone" before it did.
     Naukri usually answers that request with a captcha challenge, and claiming
     a code was sent when it was not is worse than saying so. */
  const isMobile = /^\d{10,}$/.test(username.replace(/\D/g, ""));
  otpPending = { username, isMobile };
  try {
    await sendOtp(username, isMobile);
  } catch (e) {
    if (e instanceof NaukriApiError && e.kind === "recaptcha") {
      otpPending = null;
      return {
        ok: false,
        message:
          "Naukri wants a captcha before it will send a code. Sign in once in the browser panel, then press “Use the browser session” — no password is needed after that.",
      };
    }
    otpPending = null;
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Naukri did not send a code.",
    };
  }
  return {
    ok: false,
    needsOtp: true,
    message: isMobile
      ? "Naukri sent a code to your phone. Enter it to finish signing in."
      : "Naukri sent a code to your email. Enter it to finish signing in.",
  };
}

/**
 * Borrow the sign-in the user already did in the browser panel.
 *
 * This is the path that actually works end to end: the human clears the
 * password and any captcha in a real window, and the resulting `nauk_at`
 * token is read out of the same Chrome profile. No password is typed into
 * this page, and no captcha is bypassed.
 */
export async function importFromBrowser(
  dataDir: string,
  profileDir: string,
): Promise<LoginResult> {
  let cookies: Array<{ name: string; value: string }>;
  try {
    cookies = await readBrowserCookies(profileDir, "naukri.com");
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error && /ProcessSingleton|lock/i.test(e.message)
          ? "The browser is open on that profile. Close it, or hand back, then try again."
          : `Could not read the browser profile: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const at = cookies.find((c) => c.name === "nauk_at")?.value;
  const rt = cookies.find((c) => c.name === "nauk_rt")?.value;
  if (!at) {
    return {
      ok: false,
      message:
        "There is no Naukri session in the browser profile yet. Open the browser panel, sign in to Naukri once, then come back.",
    };
  }

  await saveSession(dataDir, {
    token: at,
    ...(rt ? { refresh: rt } : {}),
    savedAt: new Date().toISOString(),
  });
  otpPending = null;

  /* A cookie can be present and expired. One cheap search proves it. */
  try {
    await searchJobs({ role: "engineer", limit: 1, jobAge: 30 });
  } catch (e) {
    if (e instanceof NaukriApiError && e.kind === "auth") {
      await clearSession(dataDir);
      return {
        ok: false,
        message:
          "The browser session has expired. Sign in to Naukri in the browser panel again, then press this once more.",
      };
    }
    /* A network or parse failure is not proof the token is bad. */
  }

  return { ok: true, message: "Using the session from the browser." };
}

export async function sendOtp(username: string, isMobile: boolean): Promise<void> {
  const res = await call(OTP_SEND_URL, {
    method: "POST",
    headers: baseHeaders({ appid: "100" }),
    body: JSON.stringify({
      username,
      flowId: "login",
      isLoginByEmail: !isMobile,
      isLoginByMobile: isMobile,
    }),
  });
  if (!res.ok) {
    throw new NaukriApiError("otp", `Could not send the code (${res.status}).`, res.status);
  }
  otpPending = { username, isMobile };
}

export async function verifyOtp(
  dataDir: string,
  otp: string,
  username?: string,
  isMobile?: boolean,
): Promise<LoginResult> {
  const pending = otpPending;
  const target = username || pending?.username;
  const mobile = isMobile ?? pending?.isMobile ?? true;
  if (!target) {
    return { ok: false, message: "Start the sign-in again so we know which account to verify." };
  }

  const res = await call(OTP_VERIFY_URL, {
    method: "POST",
    headers: baseHeaders({ appid: "100" }),
    body: JSON.stringify({
      username: target,
      token: otp,
      flowId: "login",
      isLoginByEmail: !mobile,
      isLoginByMobile: mobile,
    }),
  });

  if (!res.ok) {
    return { ok: false, message: "That code was not accepted. Check it and try again." };
  }

  const { token, refresh } = readCookies(res);
  let bearer = token;
  if (!bearer) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    bearer = (body.authToken as string) || (body.token as string) || undefined;
  }
  if (!bearer) {
    return { ok: false, message: "The code was accepted but Naukri sent no session. Try the browser panel." };
  }

  await saveSession(dataDir, {
    token: bearer,
    ...(refresh ? { refresh } : {}),
    savedAt: new Date().toISOString(),
  });
  otpPending = null;
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* search                                                              */
/* ------------------------------------------------------------------ */

export type NaukriSearchOptions = {
  role: string;
  city?: string;
  limit?: number;
  /** Days back. Naukri's own filter, 1–30. */
  jobAge?: number;
  page?: number;
};

type RawJob = {
  jobId?: string | number;
  title?: string;
  companyName?: string;
  jdURL?: string;
  tagsAndSkills?: string;
  footerPlaceholderLabel?: string;
  jobDescription?: string;
  companyApplyJob?: boolean;
  placeholders?: Array<{ type?: string; label?: string }>;
};

function seoKey(role: string, city: string | undefined, page: number): string {
  const kw = role.trim().toLowerCase()
    .replace(/\./g, "-dot-")
    .replace(/\+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-|-$/g, "");
  const loc = (city || "").trim().toLowerCase().replace(/\s+/g, "-");
  return loc ? `${kw}-jobs-in-${loc}-${page}` : `${kw}-jobs-${page}`;
}

function placeholder(job: RawJob, type: string): string {
  return job.placeholders?.find((p) => p.type === type)?.label || "";
}

/** "3 days ago" / "Just now" -> ISO, or undefined. Never invented. */
function postedFrom(text: string, now: Date): string | undefined {
  const t = (text || "").toLowerCase();
  if (!t) return undefined;
  if (/just now|today|few hours/.test(t)) return now.toISOString();
  const m = t.match(/(\d+)\s*(hour|day|week|month)s?\s*ago/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const d = new Date(now);
  if (m[2] === "hour") d.setHours(d.getHours() - n);
  else if (m[2] === "day") d.setDate(d.getDate() - n);
  else if (m[2] === "week") d.setDate(d.getDate() - n * 7);
  else d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

function toJob(raw: RawJob, now: Date): Job | null {
  const id = String(raw.jobId ?? "").trim();
  const title = (raw.title || "").trim();
  if (!id || !title) return null;

  const href = raw.jdURL || `/job-listings-${id}`;
  const sourceUrl = href.startsWith("http") ? href : `${BASE}${href}`;
  const posted = postedFrom(raw.footerPlaceholderLabel || "", now);
  const skills = (raw.tagsAndSkills || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  const description = [
    raw.jobDescription || "",
    skills.length ? `Skills: ${skills.join(", ")}` : "",
    placeholder(raw, "experience") ? `Experience: ${placeholder(raw, "experience")}` : "",
    placeholder(raw, "salary") ? `Salary: ${placeholder(raw, "salary")}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    id: `naukri:${id}`,
    sourceId: "naukri",
    sourceUrl,
    company: (raw.companyName || "").trim() || "Not stated",
    title,
    location: placeholder(raw, "location"),
    country: "IN",
    description,
    ...(posted ? { datePosted: posted } : {}),
    firstSeenAt: now.toISOString(),
    status: "open",
  } as Job;
}

export type NaukriSearchResult = {
  jobs: Job[];
  total?: number;
  /** True when the posting is applied for on the employer's own site. */
  external: string[];
};

export async function searchJobs(opts: NaukriSearchOptions): Promise<NaukriSearchResult> {
  const page = opts.page ?? 1;
  const params = new URLSearchParams({
    noOfResults: String(opts.limit ?? 20),
    urlType: "search_by_keyword",
    searchType: "adv",
    keyword: opts.role,
    k: opts.role,
    pageNo: String(page),
    experience: "0",
    jobAge: String(opts.jobAge ?? 7),
    nignbevent_src: "jobsearchDeskGNB",
    seoKey: seoKey(opts.role, opts.city, page),
    src: "jobsearchDesk",
    latLong: "",
  });

  const res = await call(`${SEARCH_URL}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders({
      appid: "109",
      gid: "LOCATION,INDUSTRY,EDUCATION,FAREA_ROLE",
      nkparam: nkparam("srp"),
    }),
  });

  if (!res.ok) {
    throw new NaukriApiError("parse", `Search failed (${res.status}).`, res.status);
  }

  const data = (await res.json().catch(() => null)) as
    | { jobDetails?: RawJob[]; jobs?: RawJob[]; noOfJobs?: number }
    | null;
  if (!data) throw new NaukriApiError("parse", "Naukri returned something that was not JSON.");

  const now = new Date();
  const raw = data.jobDetails || data.jobs || [];
  const jobs = raw.map((r) => toJob(r, now)).filter((j): j is Job => Boolean(j));
  const external = raw
    .filter((r) => r.companyApplyJob)
    .map((r) => String(r.jobId ?? ""))
    .filter(Boolean);

  return {
    jobs,
    ...(typeof data.noOfJobs === "number" ? { total: data.noOfJobs } : {}),
    external,
  };
}

/* ------------------------------------------------------------------ */
/* apply                                                               */
/* ------------------------------------------------------------------ */

function sid(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}0000000`
  );
}

export type ApplyResult = {
  ok: boolean;
  message: string;
  /** Naukri's own words, when it gave any. */
  raw?: unknown;
};

/**
 * One-click apply on a Naukri-hosted posting. A company-site posting cannot be
 * applied here — it returns `ok:false` with the reason instead of pretending.
 */
export async function applyJob(
  jobId: string,
  opts: { source?: "search" | "recommended"; mandatorySkills?: string[]; optionalSkills?: string[] } = {},
): Promise<ApplyResult> {
  const id = jobId.replace(/^naukri:/, "");
  if (!id) return { ok: false, message: "No job id to apply to." };

  const source = opts.source ?? "search";
  const sessionId = sid();
  const applySrc = source === "recommended" ? "drecomm_apply" : "srp";
  const logstr =
    source === "recommended"
      ? `--drecomm_apply-1-F-0-1--${sessionId}-`
      : `--srp-1-F-0-1--${sessionId}-`;

  const res = await call(APPLY_URL, {
    method: "POST",
    headers: authHeaders({ appid: "121", systemid: "jobseeker" }),
    body: JSON.stringify({
      strJobsarr: [id],
      logstr,
      flowtype: "show",
      crossdomain: true,
      jquery: 1,
      rdxMsgId: "",
      chatBotSDK: true,
      mandatory_skills: opts.mandatorySkills ?? [],
      optional_skills: opts.optionalSkills ?? [],
      applyTypeId: "107",
      closebtn: "y",
      applySrc,
      sid: sessionId,
      mid: "",
    }),
  });

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    return {
      ok: false,
      message: `Naukri refused the application (${res.status}).`,
      ...(body ? { raw: body } : {}),
    };
  }

  /* Naukri answers 200 with a questionnaire when the posting asks questions.
     That is not a failure — it is a form we cannot fill blind. */
  const questions = (body?.questionnaire as unknown[]) || [];
  if (Array.isArray(questions) && questions.length) {
    return {
      ok: false,
      message: `This posting asks ${questions.length} question${questions.length > 1 ? "s" : ""}. Answer them in the browser panel.`,
      raw: body,
    };
  }

  return { ok: true, message: "Applied.", ...(body ? { raw: body } : {}) };
}

/* ------------------------------------------------------------------ */
/* history                                                             */
/* ------------------------------------------------------------------ */

export type AppliedHistory = {
  jobId: string;
  title: string;
  company: string;
  location: string;
  appliedAt?: string;
  statuses: Array<{ value: string; at?: string }>;
};

/** What Naukri itself thinks you applied to. Used to reconcile the audit log. */
export async function applicationHistory(days = 90, pageSize = 50): Promise<AppliedHistory[]> {
  const params = new URLSearchParams({
    pageSize: String(pageSize),
    days: String(days),
    pageNumber: "1",
    filterInfo: "2",
  });

  const res = await call(`${HISTORY_URL}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders({
      appid: "107",
      systemid: "107",
      referer: `${BASE}/myapply/historypage`,
    }),
  });

  if (!res.ok) throw new NaukriApiError("parse", `History failed (${res.status}).`, res.status);

  const data = (await res.json().catch(() => null)) as
    | { applyDetails?: Array<Record<string, unknown>> }
    | null;

  return (data?.applyDetails || []).map((item) => {
    const statuses = (item.status as Array<Record<string, unknown>> | undefined) || [];
    return {
      jobId: String(item.jobId ?? ""),
      title: String(item.jobTitle ?? ""),
      company: String(item.company ?? ""),
      location: String(item.location ?? ""),
      statuses: statuses.map((s) => ({
        value: String(s.statusValue ?? ""),
        ...(s.dateTime ? { at: String(s.dateTime) } : {}),
      })),
    };
  });
}

export const NAUKRI_API_POLICY = {
  id: "naukri-api",
  name: "Naukri (API)",
  tier: 2 as const,
  discovery: "user-session" as const,
  submission: "user-directed" as const,
  auth: ["password", "otp"] as const,
  notes:
    "Naukri's own internal endpoints. No paid key. Requires the user's account, a home IP, and an OTP on first sign-in. Undocumented, so the browser connector stays as the fallback.",
};
