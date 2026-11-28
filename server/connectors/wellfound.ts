// Wellfound (formerly AngelList Talent), read in the user's own session.
//
// Wellfound blocks plain requests, so its role page is opened in the
// Career-Ops window with the user's signed-in profile, and the listings are
// read from the page's own data (__NEXT_DATA__ → Apollo state): each
// JobListingSearchResult has the title, description, posted time
// (liveStartAt), locations, remote flag, pay and years; the company comes from
// the StartupResult that lists it. Measured 2026-11-28: 30 Product Manager
// listings on /role/l/product-manager/india. Wellfound's city pages ignore
// the city for Chennai, so the India page is read and the city is a score,
// not a filter.
//
// One page (two at most), at human pace. A bot check is the user's to pass.

import type { Job } from "@career-ops/contracts";
import { HAS_CHROME, withPage } from "../lib/browser";

export type WellfoundResult = { jobs: Job[]; needsHuman?: "captcha" | "no-browser"; message?: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function discoverWellfound(opts: { role: string; profileDir: string; pages?: number }): Promise<WellfoundResult> {
  if (!HAS_CHROME) return { jobs: [], needsHuman: "no-browser", message: "Chrome or Edge was not found on this machine." };
  try {
    return await withPage(opts.profileDir, async (page) => {
      const now = new Date().toISOString();
      const jobs: Job[] = [];
      const seen = new Set<string>();
      for (let p = 1; p <= Math.min(opts.pages ?? 1, 2); p++) {
        await page.goto(`https://wellfound.com/role/l/${slug(opts.role)}/india${p > 1 ? `?page=${p}` : ""}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForSelector("#__NEXT_DATA__", { state: "attached", timeout: 15_000 }).catch(() => {});
        const data = (await page.evaluate(`(() => {
          const el = document.getElementById("__NEXT_DATA__");
          if (!el) return { blocked: /verify|captcha|access denied|are you a robot|just a moment/i.test(document.body.innerText.slice(0, 600)) };
          const nd = JSON.parse(el.textContent || "{}");
          const st = (nd.props && nd.props.pageProps && nd.props.pageProps.apolloState && (nd.props.pageProps.apolloState.data || nd.props.pageProps.apolloState)) || {};
          const owner = {};
          for (const k of Object.keys(st)) {
            const v = st[k];
            if (!v || v.__typename !== "StartupResult") continue;
            const refs = [].concat(v.highlightedJobListings || [], v.jobListings || []).map((r) => r && r.__ref).filter(Boolean);
            for (const r of refs) owner[r] = { name: v.name, slug: v.slug };
          }
          const out = [];
          for (const k of Object.keys(st)) {
            const v = st[k];
            if (!v || v.__typename !== "JobListingSearchResult") continue;
            out.push({ key: k, id: v.id, slug: v.slug, title: v.title, description: v.description, liveStartAt: v.liveStartAt, locationNames: v.locationNames, remote: v.remote, compensation: v.compensation, min: v.yearsExperienceMin, max: v.yearsExperienceMax, jobType: v.jobType, company: owner[k] || null });
          }
          return { rows: out };
        })()`)) as { blocked?: boolean; rows?: any[] };
        if (data.blocked) return { jobs, needsHuman: "captcha" as const, message: "Wellfound asked for a check. Open it from Settings → Job sites and pass it once in the Career-Ops window." };
        const rows = data.rows || [];
        if (!rows.length) break;
        for (const r of rows) {
          const id = String(r.id || "");
          if (!id || seen.has(id) || !r.title) continue;
          const company = r.company?.name ? String(r.company.name).trim() : "";
          if (!company) continue;
          seen.add(id);
          const locs: string[] = Array.isArray(r.locationNames) ? r.locationNames.map(String) : [];
          const location = [locs.join(", "), r.remote ? "Remote" : ""].filter(Boolean).join(" · ") || "India";
          const t = typeof r.liveStartAt === "number" ? r.liveStartAt * (r.liveStartAt < 1e12 ? 1000 : 1) : Date.parse(String(r.liveStartAt || ""));
          const exp = Number(r.max) > 0 ? `${Number(r.min) || 0}-${r.max} years` : Number(r.min) > 0 ? `${r.min}+ years` : "";
          const link = `https://wellfound.com/jobs/${id}${r.slug ? `-${r.slug}` : ""}`;
          jobs.push({
            id: `wellfound:${id}`,
            sourceId: "wellfound",
            sourceUrl: link,
            applyUrl: link,
            company,
            title: String(r.title).trim(),
            location,
            country: "IN",
            ...(r.remote ? { workMode: "remote" as const } : {}),
            description: [String(r.description || "").replace(/[*#]+/g, "").slice(0, 4000), exp ? `Experience: ${exp}` : ""].filter(Boolean).join("\n"),
            ...(exp ? { experienceAsked: exp } : {}),
            ...(Number.isFinite(t) && t > 0 ? { datePosted: new Date(t).toISOString() } : {}),
            firstSeenAt: now,
            status: "open" as const,
            ...(r.compensation ? { salary: String(r.compensation) } : {}),
          } as Job);
        }
        if (p < (opts.pages ?? 1)) await page.waitForTimeout(1200 + Math.round(Math.random() * 800));
      }
      return { jobs };
    });
  } catch (e) {
    return { jobs: [], message: e instanceof Error ? e.message : String(e) };
  }
}

export const WELLFOUND_POLICY = {
  id: "wellfound",
  name: "Wellfound",
  tier: 2 as const,
  discovery: "user-session" as const,
  submission: "user-directed" as const,
  auth: ["sso", "password-on-site"] as const,
  notes:
    "Plain requests are blocked. The role page for India is opened in the Career-Ops window with the user's signed-in profile and the listings read from the page's own data (title, description, liveStartAt, locations, remote, pay, years; company from the StartupResult). One or two pages at human pace. A bot check hands over.",
};
