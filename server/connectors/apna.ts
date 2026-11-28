// Apna, read from its public role-and-city page.
//
// Apna's search runs server-side: its page for a role in a city
// (/jobs/product_manager-jobs-in-chennai) arrives as HTML with the vacancies
// already in it, each a card with title, employer, city, salary, work mode,
// job type and minimum experience. A plain request with an honest user agent
// gets the same page, so no browser is opened. Measured 2026-11-28: 25
// Product Manager vacancies in Chennai.
//
// Not the signed-in page: signed in, Apna replaces the search with its own
// picks (software roles for a PM search). Applying still uses the user's
// signed-in session. The posted date, address and PIN code come from each
// job's own page (below).

import type { Job } from "@career-ops/contracts";

export type ApnaResult = { jobs: Job[]; needsHuman?: "captcha"; message?: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };
const decode = (t: string) => t.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENT[m] || m);

/** The text lines of one card: tags, styles and scripts removed. */
function lines(html: string): string[] {
  return decode(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "\n")
      .replace(/<[^>]+>/g, "\n"),
  )
    .split("\n")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && !/^[.#@{]/.test(s) && !/[{};]\s*$/.test(s));
}

/* Each job's own page carries schema.org JobPosting data: the street
   address, PIN code, the real posted date and the full description. Read for
   every card, four at a time, so a job says where it is and when it was
   posted. Measured 2026-11-28: Elsevier, "Ascendas Tech Park, Chennai 600001",
   posted 21 Nov. */
type Detail = { datePosted?: string; address?: string; postal?: string; description?: string };
async function detail(link: string): Promise<Detail> {
  try {
    const r = await fetch(link, { headers: { "user-agent": "career-ops-india/0.3 (local job search)" }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return {};
    const h = await r.text();
    for (const m of h.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      let j: any; try { j = JSON.parse(m[1]!); } catch { continue; }
      const jp = (Array.isArray(j) ? j : j["@graph"] || [j]).find((x: any) => x && x["@type"] === "JobPosting");
      if (!jp) continue;
      const a = jp.jobLocation?.address || (Array.isArray(jp.jobLocation) ? jp.jobLocation[0]?.address : null) || {};
      const street = String(a.streetAddress || "").replace(/\s+/g, " ").replace(/^India-/i, "").trim();
      const place = [street, a.addressLocality].filter(Boolean).join(", ");
      const d = Date.parse(String(jp.datePosted || ""));
      return {
        ...(Number.isFinite(d) ? { datePosted: new Date(d).toISOString() } : {}),
        ...(place ? { address: place } : {}),
        ...(a.postalCode ? { postal: String(a.postalCode) } : {}),
        ...(jp.description ? { description: decode(String(jp.description).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 4000) } : {}),
      };
    }
  } catch { /* the card alone is still a posting */ }
  return {};
}

export async function discoverApna(opts: { role: string; city?: string; limit?: number }): Promise<ApnaResult> {
  const url = `https://apna.co/jobs/${slug(opts.role)}-jobs-in-${slug(opts.city || "india")}`;
  let html = "";
  try {
    const r = await fetch(url, { headers: { "user-agent": "career-ops-india/0.3 (local job search)", "accept-language": "en-IN,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (r.status === 403 || r.status === 429) return { jobs: [], needsHuman: "captcha", message: `Apna refused the request (${r.status}).` };
    if (!r.ok) return { jobs: [], message: `Apna answered ${r.status}.` };
    html = await r.text();
  } catch (e) {
    return { jobs: [], message: e instanceof Error ? e.message : String(e) };
  }
  /* each card starts at its link; it runs to the next link */
  const parts = html.split(/<a[^>]+href="(\/job\/[^"]+)"[^>]*>/);
  const now = new Date().toISOString();
  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (let i = 1; i + 1 < parts.length && jobs.length < (opts.limit ?? 40); i += 2) {
    const href = parts[i]!;
    const id = (href.match(/(\d{6,})\/?$/) || [])[1];
    if (!id || seen.has(id)) continue;
    const L = lines(parts[i + 1]!.slice(0, 6000)).slice(0, 12);
    const [title, company, location, ...rest] = L;
    if (!title || !company || title.length > 140) continue;
    seen.add(id);
    const salary = rest.find((x) => /₹|lpa|per month|not disclosed/i.test(x));
    const mode = rest.find((x) => /work from (home|office)|hybrid|field job/i.test(x)) || "";
    const exp = rest.find((x) => /min\.?\s*\d+\s*year|fresher|\d+\s*-\s*\d+\s*years?/i.test(x)) || "";
    const type = rest.find((x) => /full time|part time|contract|internship/i.test(x)) || "";
    const link = new URL(href, "https://apna.co").toString();
    jobs.push({
      id: `apna:${id}`,
      sourceId: "apna",
      sourceUrl: link,
      applyUrl: link,
      company,
      title,
      location: location || opts.city || "India",
      country: "IN",
      ...(/home/i.test(mode) ? { workMode: "remote" as const } : /hybrid/i.test(mode) ? { workMode: "hybrid" as const } : /office/i.test(mode) ? { workMode: "office" as const } : {}),
      description: [mode, type, exp ? `Experience: ${exp}` : ""].filter(Boolean).join("\n"),
      ...(exp ? { experienceAsked: exp } : {}),
      firstSeenAt: now,
      status: "open" as const,
      ...(salary && !/not disclosed/i.test(salary) ? { salary } : {}),
    } as Job);
  }
  /* the job pages, four at a time, a beat apart */
  for (let i = 0; i < jobs.length; i += 4) {
    const batch = jobs.slice(i, i + 4);
    const got = await Promise.all(batch.map((j) => detail(j.sourceUrl)));
    got.forEach((d, k) => {
      const j = batch[k] as any;
      if (d.datePosted) j.datePosted = d.datePosted;
      /* the address, each part once; Apna's PIN code is the city's head post
         office (600001 for every Chennai job), so it is not shown */
      if (d.address) {
        const seen = new Set<string>();
        const parts = d.address.split(/\s*,\s*/).map((x) => x.replace(/\s*\(([^)]*)\)/, " · $1").trim())
          .filter((x) => x && !/^(india|tamil nadu)$/i.test(x) && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
        j.location = parts.slice(0, 4).join(", ").slice(0, 110);
      }
      if (d.description) j.description = [j.description, d.description].filter(Boolean).join("\n\n");
    });
    if (i + 4 < jobs.length) await new Promise((r) => setTimeout(r, 300));
  }
  return { jobs };
}

export const APNA_POLICY = {
  id: "apna",
  name: "Apna",
  tier: 1 as const,
  discovery: "public-page" as const,
  submission: "user-directed" as const,
  auth: ["otp"] as const,
  notes:
    "Apna's search is server-rendered. Its public role-and-city page is fetched with an honest user agent and each card read; then each job's own page (four at a time) for its schema.org JobPosting: street address, PIN code, posted date and description. The signed-in page is not used: it swaps the query for Apna's own picks, and its distance filter drops the role (tested 2026-11-28). Applying uses the user's session.",
};
