/* Job sites the user signs in to once, in the app's browser (ADR-022).
 *
 * The sign-in happens on the site's own page, streamed into a popup. The
 * app never sees a password, never solves a captcha and never fills a sign-in
 * form: it only notices that the user is in, and remembers when. Naukri has
 * its own phone + OTP form (ADR-027) and is not listed here.
 *
 * "Signed in" is read from the page the user is on: a logout or account link
 * in the page (visible or in a menu), or a known session cookie, and not on
 * the site's sign-in path. That is a check, not a promise, so the card says
 * "Signed in on <date>", and a run that meets a sign-in page hands over.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { currentPage, getContext } from "./browser";
import { routeFor } from "./user-browser";

export type ApplyMode = "auto" | "prefill" | "fill" | "open";

export type JobSite = {
  id: string;
  name: string;
  host: string;
  loginUrl: string;
  /** "indeed" keeps Indeed in its own profile (ADR-021); the rest share one. */
  profile: "default" | "indeed";
  /** How the site signs you in, in its own words. */
  signin: string;
  find: string;
  apply: ApplyMode;
  /** Whether the app finds and applies here today. */
  live: boolean;
  note?: string;
  /** The path of the site's sign-in pages. */
  loginPath: RegExp;
  /** A cookie only a signed-in browser carries, where it is known. */
  sessionCookie?: RegExp;
  /** Pages only a signed-in user reaches (foundit's /seeker/dashboard). */
  signedInPath?: RegExp;
};

export const JOB_SITES: JobSite[] = [
  {
    id: "indeed", name: "Indeed India", host: "indeed.com", loginUrl: "https://secure.indeed.com/auth?hl=en_IN&co=IN",
    profile: "indeed", signin: "Email code or Google", find: "Your session", apply: "auto", live: true,
    loginPath: /\/(auth|account\/login)/i, sessionCookie: /^(SOCK|SHOE)$/,
  },
  {
    id: "linkedin", name: "LinkedIn", host: "linkedin.com", loginUrl: "https://www.linkedin.com/login",
    profile: "default", signin: "Email and password, or Google", find: "Licensed feeds and your session", apply: "prefill", live: true,
    note: "LinkedIn’s terms forbid automated applying. Jobs that send you to a company careers page are applied there; Easy Apply is filled and you press Submit.",
    loginPath: /\/(login|checkpoint|uas)/i, sessionCookie: /^li_at$/,
  },
  {
    id: "foundit", name: "foundit", host: "foundit.in", loginUrl: "https://www.foundit.in/rio/login",
    profile: "default", signin: "Mobile OTP, email or Google", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/(rio\/)?login/i, signedInPath: /^\/seeker\//i,
  },
  {
    id: "instahyre", name: "Instahyre", host: "instahyre.com", loginUrl: "https://www.instahyre.com/login/",
    profile: "default", signin: "Email or Google", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/login/i,
  },
  {
    id: "cutshort", name: "Cutshort", host: "cutshort.io", loginUrl: "https://cutshort.io/login",
    profile: "default", signin: "Email code, Google or LinkedIn", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/(login|signup)/i,
  },
  {
    id: "hirist", name: "Hirist", host: "hirist.tech", loginUrl: "https://www.hirist.tech/login",
    profile: "default", signin: "Email or mobile OTP", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/login/i,
  },
  {
    id: "iimjobs", name: "iimjobs", host: "iimjobs.com", loginUrl: "https://www.iimjobs.com/login",
    profile: "default", signin: "Email or mobile OTP", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/login/i,
  },
  {
    id: "wellfound", name: "Wellfound", host: "wellfound.com", loginUrl: "https://wellfound.com/login",
    profile: "default", signin: "Email or Google", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    note: "Wellfound blocks automated browsers. If it shows a check, it is yours to pass.",
    loginPath: /\/(login|join)/i,
  },
  {
    id: "internshala", name: "Internshala", host: "internshala.com", loginUrl: "https://internshala.com/login/user",
    profile: "default", signin: "Email or Google", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/login/i,
  },
  {
    id: "shine", name: "Shine", host: "shine.com", loginUrl: "https://www.shine.com/login/",
    profile: "default", signin: "Mobile OTP or email", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/login/i,
  },
  {
    id: "apna", name: "Apna", host: "apna.co", loginUrl: "https://apna.co/",
    profile: "default", signin: "Mobile OTP", find: "Firecrawl or TinyFish search", apply: "auto", live: false,
    loginPath: /\/(login|auth)/i,
  },
];

type Store = Record<string, { signedInAt: string }>;
const file = (dataDir: string) => join(dataDir, "site-sessions.json");

async function readStore(dataDir: string): Promise<Store> {
  try { return JSON.parse(await readFile(file(dataDir), "utf8")) as Store; } catch { return {}; }
}
async function writeStore(dataDir: string, store: Store): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(file(dataDir), JSON.stringify(store, null, 2), "utf8");
}

const onHost = (url: string, host: string) => {
  try { const h = new URL(url).hostname.toLowerCase(); return h === host || h.endsWith("." + host); } catch { return false; }
};

export type SiteView = Omit<JobSite, "loginPath" | "sessionCookie"> & { signedInAt?: string; mine: boolean };

export async function listJobSites(dataDir: string): Promise<SiteView[]> {
  const store = await readStore(dataDir);
  return JOB_SITES.map(({ loginPath: _l, sessionCookie: _c, ...s }) => ({ ...s, mine: Boolean(routeFor(`https://${s.host}/`)), ...(store[s.id] ? { signedInAt: store[s.id]!.signedInAt } : {}) }));
}

/**
 * Is the user signed in on this site, judged from the page open in the app's
 * browser? null when that page is not on the site (nothing to judge yet).
 * A yes is remembered; a no changes nothing that was remembered.
 */
/* Cookies the site set while the popup was settling, per site. A session
   cookie that appears after that, while you sign in, means you are in: this
   is how a site with no logout link in the page (Apna) is noticed. */
const AUTH_COOKIE = /(auth|token|session|sess|jwt|access|logged|login|user_?id|uid|member)/i;
const baseline = new Map<string, { names: Set<string>; checks: number }>();

export async function checkSignin(dataDir: string, id: string, start = false): Promise<{ ok: boolean; signedIn: boolean | null; signedInAt?: string; blocked?: boolean; message?: string }> {
  const site = JOB_SITES.find((s) => s.id === id);
  if (!site) return { ok: false, signedIn: null, message: "Unknown site." };
  if (start) baseline.delete(id);
  const page = currentPage();
  if (!page || page.isClosed() || !onHost(page.url(), site.host)) return { ok: true, signedIn: null };
  const onLogin = site.loginPath.test(new URL(page.url()).pathname);
  const jar = (await page.context().cookies().catch(() => [])).filter((c) => onHost("https://" + c.domain.replace(/^\./, ""), site.host));
  const cookie = Boolean(site.sessionCookie) && jar.some((c) => site.sessionCookie!.test(c.name));
  /* the first three looks (about six seconds) learn what an anonymous visit sets */
  const b = baseline.get(id) ?? { names: new Set<string>(), checks: 0 };
  let fresh = false;
  if (b.checks < 3) { for (const c of jar) b.names.add(c.name); b.checks++; }
  else fresh = jar.some((c) => !b.names.has(c.name) && AUTH_COOKIE.test(c.name));
  baseline.set(id, b);
  /* Read-only look at the page's own links and buttons, hidden menus
     included: a way out means you are in; only a way in means you are not. */
  const seen = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    /* a bot wall in front of the site: the user's to pass, never ours */
    const head = ((doc.title || "") + " " + String(doc.body?.innerText || "").slice(0, 400)).toLowerCase();
    const blocked = /access denied|attention required|just a moment|verify you are human|are you a robot|request blocked/.test(head);
    const items = Array.from(doc.querySelectorAll("a, button, [role=menuitem]")) as any[];
    let out = false, inn = false, acct = false;
    for (const el of items) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      const href = (el.getAttribute("href") || "").toLowerCase();
      if (/^(log ?out|sign ?out)$/.test(t) || /log-?out|sign-?out|logoff/.test(href)) out = true;
      else if (/^(log ?in|sign ?in|login|register|sign up|join now)$/.test(t)) inn = true;
      /* the account's own links: only a signed-in visitor has them */
      if (/^(my profile|my account|my jobs|applied jobs|my applications|view profile|edit profile)$/.test(t) || /\/(my-?profile|myaccount|mnjuser|seeker\/(dashboard|profile))/.test(href)) acct = true;
    }
    /* "Hi, Asha" in the header */
    const greet = Array.from(doc.querySelectorAll("header *, nav *, [class*=header] *") as ArrayLike<any>).some((el: any) => el.children.length === 0 && /^(hi|hello),?\s+[a-z]/i.test(String(el.textContent || "").trim()));
    return { out, inn, blocked, acct: acct || greet };
  }).catch(() => ({ out: false, inn: false, blocked: false, acct: false }));
  const onAccount = Boolean(site.signedInPath && site.signedInPath.test(new URL(page.url()).pathname));
  const signedIn = cookie || onAccount || (!onLogin && (seen.out || fresh || (seen.acct && !seen.inn)));
  if (!signedIn) return { ok: true, signedIn: false, ...(seen.blocked ? { blocked: true } : {}) };
  const store = await readStore(dataDir);
  store[id] = { signedInAt: new Date().toISOString() };
  await writeStore(dataDir, store);
  return { ok: true, signedIn: true, signedInAt: store[id]!.signedInAt };
}

/** The user says they are signed in and the page could not show it. */
export async function markSignedIn(dataDir: string, id: string): Promise<{ ok: boolean; signedInAt?: string; message?: string }> {
  if (!JOB_SITES.some((s) => s.id === id)) return { ok: false, message: "Unknown site." };
  const store = await readStore(dataDir);
  store[id] = { signedInAt: new Date().toISOString() };
  await writeStore(dataDir, store);
  return { ok: true, signedInAt: store[id]!.signedInAt };
}

/** Sign out here: drop that site's cookies from the app's browser profile. */
export async function signOutSite(dataDir: string, id: string): Promise<{ ok: boolean; message: string }> {
  const site = JOB_SITES.find((s) => s.id === id);
  if (!site) return { ok: false, message: "Unknown site." };
  /* a site that runs in the user's own browser: their cookies are theirs, so
     the app only forgets the record and never clears anything there */
  if (routeFor(`https://${site.host}/`)) {
    const store = await readStore(dataDir);
    delete store[id];
    await writeStore(dataDir, store);
    return { ok: true, message: `Forgotten here. To sign out of ${site.name}, do it in your own browser.` };
  }
  const profileDir = join(dataDir, site.profile === "indeed" ? "browser-profile-indeed" : "browser-profile");
  try {
    const ctx = await getContext(profileDir);
    const esc = site.host.replace(/\./g, "\\.");
    await ctx.clearCookies({ domain: new RegExp(`(^|\\.)${esc}$`) });
  } catch (e) {
    return { ok: false, message: `Could not clear the session: ${String((e as Error)?.message || e).slice(0, 140)}` };
  }
  const store = await readStore(dataDir);
  delete store[id];
  await writeStore(dataDir, store);
  return { ok: true, message: `Signed out of ${site.name} on this computer.` };
}
