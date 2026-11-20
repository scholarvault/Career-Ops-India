// Indeed India connector.
//
// Indeed serves its search results from behind Cloudflare. Plain HTTP gets a
// 403 with a captcha, its RSS feed is gone (404), and the Publisher API is
// closed to new applicants. What does work is a real Chrome with a persistent
// profile: the first visit to in.indeed.com sets the clearance cookie, and the
// search that follows renders normally. Verified 2026-11-20: 48 cards for
// "product manager" in Chennai.
//
// The list cards no longer carry a description, so a card is scored on its
// title until `fetchIndeedDetail` reads the posting page. That page also tells
// us whether the apply button hands off to the employer's own ATS, which is
// the case `/api/fill` can complete.
//
// It never signs in, never solves a challenge and never submits.

import type { Job } from "@career-ops/contracts";
import { HAS_CHROME, withPage } from "../lib/browser";

export type IndeedOptions = {
  role: string;
  city?: string;
  profileDir: string;
  limit?: number;
};

export type IndeedResult = {
  jobs: Job[];
  needsHuman?: "captcha" | "no-browser";
  message?: string;
  total?: number;
};

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "+").replace(/^\+|\+$/g, "");
}

function searchUrl(role: string, city?: string): string {
  const q = `q=${slug(role)}`;
  const l = city ? `&l=${slug(city)}` : "";
  /* fromage=7 is Indeed's own "last 7 days" filter, so every card returned is
     inside the freshness rule even when the card prints no date. */
  return `https://in.indeed.com/jobs?${q}${l}&fromage=7&sort=date`;
}

type Card = {
  jk: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  jobType: string;
  age: string;
};

/** "3 days ago" / "Just posted" / "30+ days ago" -> ISO date, or undefined. */
function postedFrom(text: string, now: Date): string | undefined {
  const t = text.toLowerCase().trim();
  if (!t) return undefined;
  if (/just posted|today|just now/.test(t)) return now.toISOString();
  const m = t.match(/(\d+)\+?\s*(hour|day|week|month)s?\s*ago/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const d = new Date(now);
  if (m[2] === "hour") d.setHours(d.getHours() - n);
  else if (m[2] === "day") d.setDate(d.getDate() - n);
  else if (m[2] === "week") d.setDate(d.getDate() - n * 7);
  else d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

function money(text: string): string {
  const m = text.match(/(₹|rs\.?|inr)\s?[\d,]+(\.\d+)?(\s?[–-]\s?(₹|rs\.?|inr)?\s?[\d,]+(\.\d+)?)?(\s?(a|per)\s?(year|month|annum))?/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

function blockedReason(body: string): "captcha" | null {
  if (/additional verification|just a moment|verify you are human|are you a robot|request blocked|you have been blocked/i.test(body)) {
    return "captcha";
  }
  return null;
}

export async function discoverIndeed(opts: IndeedOptions): Promise<IndeedResult> {
  if (!HAS_CHROME) {
    return { jobs: [], needsHuman: "no-browser", message: "Chrome or Edge was not found on this machine." };
  }

  const now = new Date();

  try {
    /* Borrows a tab from the shared browser: the Cloudflare clearance cookie
       and any sign-in the user did in the embedded panel both survive. */
    return await withPage(opts.profileDir, async (page) => {
      /* The warm-up is not optional. Hitting the search URL on a cold profile
         returns the Cloudflare interstitial; loading the home page first lets
         the clearance cookie land, and the search then renders. */
      await page.goto("https://in.indeed.com/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(5000);

    const url = searchUrl(opts.role, opts.city);
    let rendered = false;
    for (let attempt = 0; attempt < 2 && !rendered; attempt++) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      try {
        await page.waitForSelector(".job_seen_beacon, .jobsearch-ResultsList > li", { timeout: 20000 });
        rendered = true;
      } catch {
        if (attempt === 0) await page.waitForTimeout(4000);
      }
    }

    if (!rendered) {
      const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
      const why = blockedReason(body);
      if (why) {
        return {
          jobs: [],
          needsHuman: why,
          message: "Indeed asked for a verification. Solve it once in the window; the session is then remembered.",
        };
      }
      return { jobs: [], message: "No job cards rendered. Indeed may have changed its layout." };
    }

    const heading = await page.locator("h1").first().innerText().catch(() => "");
    const totalMatch = heading.match(/([\d,]+)\s+(?:job|vacanc)/i);
    const total = totalMatch?.[1] ? Number(totalMatch[1].replace(/,/g, "")) : undefined;

    /* Passed as a string: esbuild's __name helper does not exist in the page. */
    const cards = (await page.evaluate(`(() => {
      const out = [];
      const nodes = document.querySelectorAll(".job_seen_beacon, .jobsearch-ResultsList > li");
      for (const n of nodes) {
        const a = n.querySelector("a.jcs-JobTitle, a[data-jk], h3.jobTitle a, h2.jobTitle a");
        const jk = (a && a.getAttribute("data-jk")) || n.getAttribute("data-jk") || "";
        const titleNode = n.querySelector(".jobTitle, h3.jobTitle, h2.jobTitle");
        const title = titleNode ? (titleNode.innerText || "").trim() : (a ? (a.innerText || "").trim() : "");
        const company = (n.querySelector("[data-testid='company-name'], .companyName") || {}).innerText || "";
        const location = (n.querySelector("[data-testid='text-location'], .companyLocation") || {}).innerText || "";
        const attrs = Array.from(n.querySelectorAll("[data-testid='attribute_snippet_testid'], .metadata, .salary-snippet-container, .salaryOnly")) 
          .map((x) => (x.innerText || "").trim()).filter(Boolean);
        const dateNode = n.querySelector(".date, [data-testid='myJobsStateDate'], .css-qvloho");
        out.push({
          jk,
          title: title.trim(),
          company: company.trim(),
          location: location.trim(),
          attrs,
          age: dateNode ? (dateNode.innerText || "").trim() : ""
        });
      }
      return out;
    })()`)) as Array<{
      jk: string; title: string; company: string; location: string; attrs: string[]; age: string;
    }>;

    const jobs: Job[] = cards
      .filter((c) => c.title && c.jk)
      .slice(0, opts.limit ?? 20)
      .map((c) => {
        const posted = postedFrom(c.age, now);
        const sal = c.attrs.map(money).find(Boolean) || "";
        const type = c.attrs.find((x) => /full-time|part-time|contract|internship|temporary|permanent|remote/i.test(x)) || "";
        return {
          id: `indeed:${c.jk}`,
          sourceId: "indeed",
          sourceUrl: `https://in.indeed.com/viewjob?jk=${c.jk}`,
          company: c.company || "Not stated",
          title: c.title,
          location: c.location,
          country: "IN",
          /* the list card carries no description; the detail page does */
          description: [type, sal].filter(Boolean).join(" · "),
          ...(posted ? { datePosted: posted } : {}),
          firstSeenAt: now.toISOString(),
          status: "open" as const,
          ...(sal ? { salary: sal } : {}),
        } as Job;
      });

    return { jobs, total };
    });
  } catch (e) {
    return { jobs: [], message: e instanceof Error ? e.message : String(e) };
  }
}

export type IndeedDetail = {
  ok: boolean;
  description?: string;
  applyUrl?: string;
  applyOnCompanySite?: boolean;
  salary?: string;
  posted?: string;
  message?: string;
};

/** Read one posting page: the full description and where its Apply goes. */
export async function fetchIndeedDetail(jk: string, profileDir: string): Promise<IndeedDetail> {
  if (!HAS_CHROME) return { ok: false, message: "Chrome or Edge was not found on this machine." };
  if (!/^[a-f0-9]{8,32}$/i.test(jk)) return { ok: false, message: "Not a valid Indeed job key." };

  try {
    return await withPage(profileDir, async (page) => {
    await page.goto("https://in.indeed.com/viewjob?jk=" + jk, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3500);

    const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (blockedReason(body)) {
      return { ok: false, message: "Indeed asked for a verification. Solve it once in the browser panel." };
    }

    const d = (await page.evaluate(`(() => {
      const t = (s) => { const n = document.querySelector(s); return n ? (n.innerText || "").trim() : null; };
      const content = document.querySelector("[data-testid='viewjob-job-content']");
      const apply = document.querySelector("[data-testid='viewjob-apply']");
      const applyLink = apply ? apply.querySelector("a") : null;
      const body = document.body ? document.body.innerText : "";
      const posted = (body.match(/Posted[^\\n]{0,40}/) || [])[0] || "";
      return {
        description: content ? (content.innerText || "").trim() : "",
        applyText: apply ? (apply.innerText || "").trim() : "",
        applyHref: applyLink ? applyLink.getAttribute("href") : null,
        posted
      };
    })()`)) as { description: string; applyText: string; applyHref: string | null; posted: string };

    const onCompanySite = /apply on company site|apply on employer site/i.test(d.applyText);
    const applyUrl = d.applyHref && /^https?:/i.test(d.applyHref) ? d.applyHref : undefined;

    return {
      ok: Boolean(d.description),
      description: d.description.slice(0, 12000),
      applyUrl,
      applyOnCompanySite: onCompanySite,
      posted: d.posted || undefined,
      ...(d.description ? {} : { message: "The posting page had no description." }),
    };
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export const INDEED_POLICY = {
  id: "indeed",
  name: "Indeed India",
  tier: 2 as const,
  discovery: "user-session" as const,
  submission: "user-directed" as const,
  auth: ["none"] as const,
  notes:
    "Cloudflare blocks plain HTTP (403) and the RSS feed is gone. Discovery runs in a real Chrome with a persistent profile; the first home-page visit sets the clearance cookie. The list card has no description, so the posting page is read on demand. Apply usually hands off to the employer's own ATS, which /api/fill can complete.",
};
