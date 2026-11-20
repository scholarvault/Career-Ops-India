// Naukri connector.
//
// Naukri renders its search results in the browser and blocks plain HTTP with
// a recaptcha, so this connector drives the local Chrome that is already
// installed. It uses a persistent profile under data/browser-profile, which
// means a sign-in you do once survives the next run.
//
// It never reads a password. If Naukri asks for a login or a captcha, the
// connector returns `needsHuman` and the UI hands control back to you.

import type { Job } from "@career-ops/contracts";
import { HAS_CHROME, withPage } from "../lib/browser";

export type NaukriOptions = {
  role: string;
  city?: string;
  /** Where the persistent Chrome profile lives. */
  profileDir: string;
  /** Max cards to read. Naukri shows 20 per page. */
  limit?: number;
  headless?: boolean;
};

export type NaukriResult = {
  jobs: Job[];
  needsHuman?: "login" | "captcha" | "no-browser";
  message?: string;
  total?: number;
};

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function searchUrl(role: string, city?: string): string {
  const r = slug(role);
  return city
    ? `https://www.naukri.com/${r}-jobs-in-${slug(city)}`
    : `https://www.naukri.com/${r}-jobs`;
}

/** "3+ weeks ago" / "2 days ago" / "Just now" -> ISO date, or undefined. */
function postedFrom(text: string, now: Date): string | undefined {
  const t = text.toLowerCase();
  if (/just now|today/.test(t)) return now.toISOString();
  const m = t.match(/(\d+)\s*(day|week|month|hour)s?\s*ago/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2];
  const d = new Date(now);
  if (unit === "hour") d.setHours(d.getHours() - n);
  else if (unit === "day") d.setDate(d.getDate() - n);
  else if (unit === "week") d.setDate(d.getDate() - n * 7);
  else d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

export async function discoverNaukri(opts: NaukriOptions): Promise<NaukriResult> {
  if (!HAS_CHROME) {
    return { jobs: [], needsHuman: "no-browser", message: "Chrome or Edge was not found on this machine." };
  }

  const now = new Date();

  try {
    /* The browser is shared with the embedded viewer and with Indeed, so this
       borrows a tab and closes only the tab. Closing the context here would
       throw away the sign-in the user just did inside the app. */
    return await withPage(opts.profileDir, async (page) => {
      const url = searchUrl(opts.role, opts.city);

      /* Naukri occasionally serves a blank shell or an Akamai interstitial on
         the first hit. One reload usually clears it, so try twice before
         reporting a layout change. */
      let rendered = false;
      for (let attempt = 0; attempt < 2 && !rendered; attempt++) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        try {
          await page.waitForSelector(".srp-jobtuple-wrapper", { timeout: 20000 });
          rendered = true;
        } catch {
          if (attempt === 0) await page.waitForTimeout(1500);
        }
      }

      if (!rendered) {
        const body = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
        if (/captcha|are you a robot|verify you are human/.test(body)) {
          return { jobs: [], needsHuman: "captcha", message: "Naukri asked for a captcha. Solve it once in the browser panel." };
        }
        if (/access denied|don't have permission/.test(body)) {
          return { jobs: [], message: "Naukri refused the request (Access Denied). Try again in a minute." };
        }
        if (/login|sign in/.test(body) && !/jobs/.test(body)) {
          return { jobs: [], needsHuman: "login", message: "Naukri asked for a sign-in. Sign in once in the browser panel." };
        }
        return { jobs: [], message: "No job cards rendered. Naukri may have changed its layout." };
      }

      const totalText = await page
        .locator("h1, .breadcrumb, .styles_count__QpFv7")
        .first()
        .innerText()
        .catch(() => "");
      const totalMatch = totalText.match(/([\d,]+)\s+(?:business|job|vacanc)/i);
      const total = totalMatch?.[1] ? Number(totalMatch[1].replace(/,/g, "")) : undefined;

      /* Passed as a string: esbuild's name-keeping helper does not exist inside
         the page, so a normal arrow function fails with "__name is not defined". */
      const cards = (await page.evaluate(`(() => {
        return Array.from(document.querySelectorAll(".srp-jobtuple-wrapper")).map((n) => {
          const q = (s) => n.querySelector(s);
          const a = q("a.title");
          const comp = q("a.comp-name");
          const exp = q(".expwdth");
          const loc = q(".locWdth");
          const sal = q(".sal");
          const age = q(".job-post-day");
          /* Naukri has moved the snippet between class names over time, so try
             each and keep whatever is there. Without a snippet every posting
             scores the same, which is worse than a short description. */
          const desc = q(".job-desc") || q(".job-description") || q("[class*='job-desc']");
          const tags = Array.from(n.querySelectorAll(".tags-gt li, .tag-li, [class*='tag'] li"))
            .map((t) => (t.innerText || "").trim())
            .filter((t) => t && t.length < 40);
          return {
            id: n.getAttribute("data-job-id") || "",
            title: (a && (a.getAttribute("title") || a.innerText)) || "",
            url: (a && a.getAttribute("href")) || "",
            company: (comp && (comp.getAttribute("title") || comp.innerText)) || "",
            experience: exp ? exp.innerText : "",
            location: loc ? loc.innerText : "",
            salary: sal ? sal.innerText : "",
            description: desc ? desc.innerText : "",
            tags: tags,
            age: age ? age.innerText : ""
          };
        });
      })()`)) as Array<{
        id: string; title: string; url: string; company: string;
        experience: string; location: string; salary: string; description: string;
        tags: string[]; age: string;
      }>;

      const jobs: Job[] = cards
        .filter((c) => c.title && c.url)
        .slice(0, opts.limit ?? 20)
        .map((c) => {
          const posted = postedFrom(c.age, now);
          const skills = [...new Set(c.tags)].slice(0, 12);
          return {
            id: `naukri:${c.id || slug(c.company + "-" + c.title)}`,
            sourceId: "naukri",
            sourceUrl: c.url,
            company: c.company || "Not stated",
            title: c.title,
            location: c.location,
            country: "IN",
            description: [
              c.description,
              skills.length ? `Skills: ${skills.join(", ")}` : "",
              c.experience ? `Experience: ${c.experience}` : "",
              c.salary ? `Salary: ${c.salary}` : "",
            ].filter(Boolean).join("\n\n"),
            ...(posted ? { datePosted: posted } : {}),
            firstSeenAt: now.toISOString(),
            status: "open" as const,
          } as Job;
        });

      return { jobs, total };
    });
  } catch (e) {
    return { jobs: [], message: e instanceof Error ? e.message : String(e) };
  }
}

export const NAUKRI_POLICY = {
  id: "naukri",
  name: "Naukri",
  tier: 2 as const,
  discovery: "user-session" as const,
  submission: "user-directed" as const,
  auth: ["google", "password", "otp"] as const,
  notes:
    "Search results are client-rendered and the JSON API returns a recaptcha. Discovery runs in the local Chrome profile; the user signs in there and the agent never sees the password.",
};
