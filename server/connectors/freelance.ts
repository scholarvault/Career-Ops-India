// Freelance connector.
//
// Freelancer.com publishes an open, no-key JSON API for active projects. It is
// the only major freelance marketplace that does: Upwork's RSS returns 403,
// Guru returns 403, and Fiverr / PeoplePerHour / Truelancer / Twine / Contra
// only serve HTML, which their terms do not allow us to scrape.
//
// Freelance work is remote by nature, so these postings are not filtered to an
// Indian city. They are labelled "Remote · worldwide" and scored on the same
// 100-point engine as everything else.

import type { Job } from "@career-ops/contracts";

const ENDPOINT = "https://www.freelancer.com/api/projects/0.1/projects/active/";

export type FreelanceResult = {
  jobs: Job[];
  ms: number;
  error?: string;
};

type ApiProject = {
  id: number;
  title: string;
  seo_url: string;
  description?: string;
  preview_description?: string;
  type?: "fixed" | "hourly";
  time_submitted?: number;
  bidperiod?: number;
  budget?: { minimum?: number; maximum?: number };
  currency?: { code?: string; sign?: string };
  jobs?: Array<{ name?: string }>;
  hourly_project_info?: { minimum_hours?: number; maximum_hours?: number };
};

function money(p: ApiProject): string | undefined {
  const min = p.budget?.minimum;
  const max = p.budget?.maximum;
  if (min == null && max == null) return undefined;
  const sign = p.currency?.sign || (p.currency?.code ? p.currency.code + " " : "");
  const range = min != null && max != null && max !== min ? `${min}–${max}` : `${min ?? max}`;
  return `${sign}${range}${p.type === "hourly" ? " / hour" : ""}`;
}

export async function discoverFreelance(role: string, limit = 20): Promise<FreelanceResult> {
  const t0 = Date.now();
  const url =
    `${ENDPOINT}?query=${encodeURIComponent(role)}` +
    `&limit=${Math.min(limit, 100)}&job_details=true&full_description=true&sort=time_updated`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Career-Ops-India/0.1 (local, user-directed job search)",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return { jobs: [], ms: Date.now() - t0, error: `HTTP ${res.status}` };
    }

    const body = (await res.json()) as { status?: string; result?: { projects?: ApiProject[] } };
    const projects = body.result?.projects ?? [];
    const now = new Date();

    const jobs: Job[] = projects
      .filter((p) => p.title && p.seo_url)
      .map((p) => {
        const skills = (p.jobs ?? []).map((j) => j.name).filter(Boolean) as string[];
        const budget = money(p);
        const bodyText = (p.description || p.preview_description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

        return {
          id: `freelancer:${p.id}`,
          sourceId: "freelancer",
          sourceUrl: `https://www.freelancer.com/projects/${p.seo_url}`,
          applyUrl: `https://www.freelancer.com/projects/${p.seo_url}`,
          company: "Freelance client",
          title: p.title.trim(),
          location: "Remote · worldwide",
          country: "IN",
          workMode: "remote" as const,
          description: [
            bodyText,
            skills.length ? `Skills: ${skills.join(", ")}` : "",
            budget ? `Budget: ${budget}` : "",
            p.type ? `Contract: ${p.type}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          ...(p.time_submitted ? { datePosted: new Date(p.time_submitted * 1000).toISOString() } : {}),
          firstSeenAt: now.toISOString(),
          status: "open" as const,
          ...(budget ? { salary: budget } : {}),
        } as Job;
      });

    return { jobs, ms: Date.now() - t0 };
  } catch (e) {
    return { jobs: [], ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

export const FREELANCE_POLICY = {
  id: "freelancer",
  name: "Freelancer.com",
  tier: 0 as const,
  discovery: "public-api" as const,
  submission: "user-directed" as const,
  auth: [] as const,
  notes:
    "Open JSON API for active projects, no key and no signup. Remote by nature, so no city filter. Bidding is left to the user.",
};
