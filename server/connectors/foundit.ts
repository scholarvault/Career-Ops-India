// foundit (formerly Monster India), read in the user's own session.
//
// foundit has no public API. Its search page fetches its own results as JSON
// from /middleware/jobsearch, and that is what this reads: the same request
// the page makes for the user, in the Career-Ops window (headed, the user's
// signed-in profile), a few pages at human pace. Nothing is crawled beyond
// the search the user would run. Measured 2026-11-28: "product manager" in
// Chennai returned 70 postings, 15 a page, each with a real posting date
// (createdAt), the employer, the skills and, often, the employer's own apply
// link, which auto apply can fill.
//
// A bot wall ("Access Denied") is the user's to pass in the window; it is
// reported as needsHuman, never worked around (AGENTS.md).

import type { Job } from "@career-ops/contracts";
import { HAS_CHROME, withPage } from "../lib/browser";

export type FounditResult = { jobs: Job[]; total?: number; needsHuman?: "captcha" | "no-browser"; message?: string };

type Row = {
  jobId?: number; id?: string; title?: string; companyName?: string; hideCompanyName?: boolean | number;
  locations?: string; createdAt?: number; skills?: string; seoJdUrl?: string; jdUrl?: string;
  applyUrl?: string; redirectUrl?: string; minimumExperience?: { years?: number }; maximumExperience?: { years?: number };
  hideSalary?: boolean | number; salary?: string; isApplied?: boolean; activeJob?: boolean | number; isJobActive?: boolean | number;
};

const PAGE = 15;

export async function discoverFoundit(opts: { role: string; city?: string; profileDir: string; limit?: number }): Promise<FounditResult> {
  if (!HAS_CHROME) return { jobs: [], needsHuman: "no-browser", message: "Chrome or Edge was not found on this machine." };
  const limit = Math.min(Math.max(opts.limit ?? 45, PAGE), 90);
  const q = encodeURIComponent(opts.role.toLowerCase());
  const loc = opts.city ? `&locations=${encodeURIComponent(opts.city.toLowerCase())}` : "";
  try {
    return await withPage(opts.profileDir, async (page) => {
      let first: any = null;
      page.on("response", async (r) => {
        if (!first && /\/middleware\/jobsearch\?/.test(r.url())) { try { first = await r.json(); } catch {} }
      });
      await page.goto(`https://www.foundit.in/srp/results?query=${q}${loc}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      for (let i = 0; i < 30 && !first; i++) await page.waitForTimeout(400);
      if (!first) {
        const t = `${await page.title().catch(() => "")} ${(await page.locator("body").innerText().catch(() => "")).slice(0, 300)}`;
        if (/access denied|attention required|just a moment|verify you are human/i.test(t)) {
          return { jobs: [], needsHuman: "captcha" as const, message: "foundit asked for a check. Open it from Settings → Job sites and pass it once in the Career-Ops window." };
        }
        return { jobs: [], message: "foundit's search did not answer." };
      }
      const res = first?.jobSearchResponse;
      const total = Number(res?.meta?.paging?.total ?? 0) || undefined;
      const rows: Row[] = [...(res?.data ?? [])];
      /* the next pages, through the page's own request, a beat apart */
      for (let start = PAGE; rows.length < limit && (!total || start < total); start += PAGE) {
        await page.waitForTimeout(700 + Math.round(Math.random() * 500));
        const more = (await page.evaluate(async (u) => {
          const r = await fetch(u, { credentials: "include" });
          if (!r.ok) return [];
          const j: any = await r.json();
          return (j && j.jobSearchResponse && j.jobSearchResponse.data) || [];
        }, `/middleware/jobsearch?sort=1&limit=${PAGE}&start=${start}&query=${q}${loc}`).catch(() => [])) as Row[];
        if (!more.length) break;
        rows.push(...more);
      }
      const now = new Date().toISOString();
      const jobs: Job[] = [];
      const seen = new Set<string>();
      for (const r of rows.slice(0, limit)) {
        const jid = String(r.jobId ?? r.id ?? "");
        if (!jid || seen.has(jid) || !r.title) continue;
        if (r.activeJob === 0 || r.isJobActive === 0 || r.isJobActive === false) continue;
        seen.add(jid);
        const company = !r.hideCompanyName && r.companyName ? String(r.companyName).trim() : "";
        if (!company) continue; // an employer is needed to tailor and to apply
        const path = r.seoJdUrl || r.jdUrl || `/job/${jid}`;
        const sourceUrl = `https://www.foundit.in${path.startsWith("/") ? "" : "/"}${path}`;
        const ext = /^https?:\/\//.test(String(r.applyUrl || "")) ? String(r.applyUrl) : /^https?:\/\//.test(String(r.redirectUrl || "")) ? String(r.redirectUrl) : "";
        const lo = r.minimumExperience?.years, hi = r.maximumExperience?.years;
        const exp = hi && hi > 0 ? `${lo ?? 0}-${hi} years` : "";
        const posted = typeof r.createdAt === "number" && r.createdAt > 0 ? new Date(r.createdAt).toISOString() : "";
        jobs.push({
          id: `foundit:${jid}`,
          sourceId: "foundit",
          sourceUrl,
          /* the employer's own form when foundit links one, else the posting */
          applyUrl: ext || sourceUrl,
          company,
          title: String(r.title).trim(),
          location: String(r.locations || "India"),
          country: "IN",
          ...(/\bremote\b/i.test(String(r.locations || "")) ? { workMode: "remote" as const } : {}),
          description: [r.skills ? `Skills: ${r.skills}` : "", exp ? `Experience: ${exp}` : ""].filter(Boolean).join("\n"),
          ...(exp ? { experienceAsked: exp } : {}),
          ...(posted ? { datePosted: posted } : {}),
          firstSeenAt: now,
          status: "open" as const,
          ...(!r.hideSalary && r.salary && !/not disclosed/i.test(r.salary) ? { salary: String(r.salary) } : {}),
        } as Job);
      }
      return { jobs, ...(total ? { total } : {}) };
    });
  } catch (e) {
    return { jobs: [], message: e instanceof Error ? e.message : String(e) };
  }
}

export const FOUNDIT_POLICY = {
  id: "foundit",
  name: "foundit (Monster India)",
  tier: 2 as const,
  discovery: "user-session" as const,
  submission: "user-directed" as const,
  auth: ["otp", "sso"] as const,
  notes:
    "No public API. The search page's own /middleware/jobsearch JSON is read in the Career-Ops window with the user's signed-in profile, a few pages at human pace. A bot check hands over. Keeps postings with an employer named; datePosted is foundit's createdAt. Apply goes to the employer's own link when foundit gives one.",
};
