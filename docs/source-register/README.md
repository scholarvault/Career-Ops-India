# Indian source register

One row per source. **Observed** means seen in the browser or in the page's own
HTML on the date shown. **Assessed** means inferred from the login page's markup
and needs a browser pass.

Last updated: 2026-11-19.

## Tier 0 — Free, no key, no signup (wired)

These six publish an open JSON endpoint. They are the only job sources that
work the moment the repo is cloned, and they cost nothing. The five remote
boards are global, so a posting is kept only when its location allows India,
APAC or "worldwide". Freelancer.com is a project marketplace: contracts rather
than salaries, open to India.

| Source | Endpoint | Verified 2026-11-19 | India-eligible that day |
|---|---|---|---|
| **Himalayas** | `GET himalayas.app/jobs/api?limit=100` | 200, 20 postings | 2 |
| **Remotive** | `GET remotive.com/api/remote-jobs` | 200, 15 postings | 7 |
| **Remote OK** | `GET remoteok.com/api` | 200, 97 postings | 11 |
| **Jobicy** | `GET jobicy.com/api/v2/remote-jobs` | 200, 50 postings | 1 |
| **Working Nomads** | `GET workingnomads.com/api/exposed_jobs/` | 200, 37 postings | 5 |
| **Freelancer.com** | `GET freelancer.com/api/projects/0.1/projects/active/?query=<q>&job_details=true&full_description=true` | 200, 20 projects | 20 (remote worldwide) |

Checked and rejected:

| Source | Result |
|---|---|
| National Career Service (`ncsapi.centralindia.cloudapp.azure.com`) | 401 without a token; the public site calls it with a session token. Not an open API. |
| The Muse | Cloudflare challenge (403) to a server-side request. |
| Arbeitnow | 200, but German-market postings; not India-relevant. |
| Workable widget | 200 but empty for the Indian slugs tried; no reliable public feed. |
| Recruitee / Teamtailor / Breezy / Personio / Rippling | No Indian tenant found with a public feed. |
| HN "Who is hiring" (Algolia) | 200, but free-text comments, not structured postings. |
| Upwork RSS | 403 to a server-side request. |
| Guru RSS | 403 to a server-side request. |
| Fiverr | HTML only, and a gig marketplace — sellers list services, so it is not a job source. |
| PeoplePerHour / Truelancer / Twine / Contra | HTML only; no public feed. |

## Tier 1 — Company ATS (full automation permitted)

| Source | Discovery | Submission | Evidence |
|---|---|---|---|
| **Lever** (`api.lever.co/v0/postings/<slug>`) | Public postings API, no key | Agent fills the public form; **user submits** | **Observed** 2026-11-19: 13 postings for `valgenesis`, full descriptions, `createdAt` |
| Ashby (`jobs.ashbyhq.com`) | Public job-posting API | Agent fills, user submits | Public API documented by Ashby |
| Greenhouse (`job-boards.greenhouse.io`) | Public Job Board API | Agent fills, user submits | Application endpoint needs employer credentials |
| Workable (`apply.workable.com`) | Public postings | Agent fills, user submits | — |
| SmartRecruiters | Public postings | Agent fills, user submits | — |

These are the only sources where the form is public, standard and login-free.
**M4 proves the loop here.**

### Indian startups on these ATS platforms — verified 2026-11-19

This is where Indian startups actually post. Every row below was read from the
company's own public API on 2026-11-19; `India` is the number of postings that
named an Indian city that day.

| Company | ATS | Slug | Postings | India |
|---|---|---|---|---|
| Paytm | Lever | `paytm` | 197 | 168 |
| Meesho | Lever | `meesho` | 48 | 47 |
| Hevo Data | Lever | `hevodata` | 40 | 39 |
| Acceldata | Lever | `acceldata` | 41 | 16 |
| Level AI | Lever | `levelai` | 19 | 16 |
| CRED | Lever | `cred` | 12 | 11 |
| Zeta | Lever | `zeta` | 32 | 28 |
| Zeta Global | Greenhouse | `zetaglobal` | 101 | 35 |
| InMobi | Greenhouse | `inmobi` | 78 | 43 |
| PubMatic | Greenhouse | `pubmatic` | 78 | 31 |
| Zenoti | Greenhouse | `zenoti` | 56 | 34 |
| Netradyne | Greenhouse | `netradyne` | 39 | 24 |
| Glance | Greenhouse | `glance` | 27 | 15 |
| Druva | Greenhouse | `druva` | 27 | 11 |
| Groww | Greenhouse | `groww` | 9 | 9 |
| slice | Greenhouse | `slice` | 21 | 0 |
| Tekion | Ashby | `tekion` | 90 | 63 |
| Sarvam AI | Ashby | `sarvam` | 43 | 43 |
| NETGEAR | Ashby | `netgear` | 54 | 32 |
| DDN | Ashby | `ddn` | 87 | 19 |
| Snowflake | Ashby | `snowflake` | 379 | 12 |
| Atlan | Ashby | `atlan` | 7 | 3 |
| Navi | Ashby | `navi` | 2 | 0 |
| Swiggy | SmartRecruiters | `Swiggy` | 180 | 56 |
| Freshworks | SmartRecruiters | `Freshworks` | 123 | 24 |

Slugs that returned 404 and are **not** wired: `razorpay`, `postman` (both on
Workday, which has no public feed), `groww`/`slice`/`navi` on Lever (they are on
Greenhouse/Ashby instead), `zepto`, `blinkit`, `phonepe`, `dream11`, `mpl`,
`sharechat`, `jupiter`, `udaan`.

### Where Indian startups post, by platform

| Platform | What it is | Access |
|---|---|---|
| **Company ATS** (Lever, Greenhouse, Ashby, SmartRecruiters) | The startup's own careers page | Public API, no key — **wired** |
| **Wellfound** (ex-AngelList) | Startup-first job board | No public API; login-walled |
| **Instahyre** | Recruiter-led matching | Login-walled |
| **Cutshort** | Startup roles, AI matching | Login-walled |
| **Hirist** | Tech roles at startups | Login-walled |
| **iimjobs** | Mid-senior startup roles | Login-walled |
| **YC Work at a Startup** | YC-backed companies | Login-walled |
| **Inc42 / YourStory jobs** | Startup media job boards | Public pages, no API |
| **Keka / Zoho Recruit** | Indian ATS vendors | Per-tenant careers page, no common feed |
| **Darwinbox** | Indian HR suite (Airtel, Udaan) | Per-tenant, no public feed |

The login-walled boards need their own ADR before a connector is built (see
ADR-013 for the pattern Naukri already uses).

### Lever — verified record

| Field | Value |
|---|---|
| Endpoint | `https://api.lever.co/v0/postings/valgenesis?mode=json` |
| Status | HTTP 200 |
| Postings returned | 13 |
| Posting | `acbc0284-0bb8-42e4-9fd1-fa3583cb458f` |
| Title | Platform Product Manager, AI/ML |
| Location | Chennai |
| Posted (`createdAt`) | 2026-04-08T06:51:23.634Z |
| First seen by us | 2026-11-19 |
| Description | 9,197 chars — Responsibilities (43), Required (41), Preferred (7) |
| Submission | Employer-side API key required — not obtainable from a candidate account |

## Tier 2 — Indian portals (user's own session; auto apply pauses for OTP/captcha)

| Platform | Login methods | Profile creation | Apply | Evidence |
|---|---|---|---|---|
| **Naukri** | Email/password, **OTP**, **Google** | Resume upload + manual | Login-walled, one-click apply | **Observed** 2026-11-19 at `naukri.com/nlogin/login` |
| **Instahyre** | **LinkedIn**, **Google**, email/password, SSO | Resume upload | Login-walled | **Observed** 2026-11-19 at `instahyre.com/login/` |
| **Shine** | Google, LinkedIn, OTP, password | Resume upload | Login-walled | Assessed from login page |
| **Freshersworld** | Google, LinkedIn, OTP, password | Resume upload | Login-walled | Assessed from login page |
| **TimesJobs** | LinkedIn, email/password | Resume upload | Login-walled | Assessed from login page |
| **iimjobs** | LinkedIn, email/password | Resume upload | Login-walled | Assessed from login page |
| **Hirist** | LinkedIn, email/password | Resume upload | Login-walled | Assessed from login page |
| **Wellfound** | Google, email/password | Manual | Login-walled | Assessed from login page |
| **Internshala** | Email/password | Resume upload | Login-walled | Assessed from login page |
| **Apna** | JS-rendered; app-first | Resume upload | Login-walled, app-first | Page shell only; needs browser pass |
| **WorkIndia** | OTP, app-first | Manual | App-first | Assessed; CloudFront 403 to non-browser |
| **Cutshort** | — | — | — | `/login` returns 404; needs browser pass |
| **PlacementIndia** | Google | Resume upload | Login-walled | Assessed from login page |

## Tier 3 — Link-in only (no automation)

| Platform | Why |
|---|---|
| **LinkedIn** | No public jobs API. `robots.txt`: "use of robots or other automated means … strictly prohibited." Reached legally through the licensed aggregators in Tier 2b. |
| **Indeed India** (submission) | Automated submission is not done. Discovery is live (ADR-021): a real Chrome profile reads the public search page, and Apply hands off to the employer's own ATS. |
| **Foundit** | Akamai returns 403 to non-browser requests; `robots.txt` blocks `/seeker/*`. |
| **Naukri** (discovery) | `robots.txt` explicitly blocks AI crawlers (edited May 2026). |

## Tier 2b — Licensed aggregator APIs (user supplies a key)

These hold a redistribution licence, so they are the legal route to
LinkedIn-sourced and Indeed-sourced listings. Each is dormant until a key is
stored in `data/secrets.json`.

**Only the free ones are wired.** The paid ones stay in the codebase but are
hidden from the UI and never called.

| Source | Endpoint | Key | Cost | Wired |
|---|---|---|---|---|
| **Jooble** | `POST jooble.org/api/<key>` | API key | Free on request, no card | yes |
| **Careerjet** (publisher) | `GET search.api.careerjet.net/v4/query` | `affid` | Free publisher key, approval | yes |
| **JSearch** (RapidAPI) | `GET jsearch.p.rapidapi.com/search` | RapidAPI key | 200 requests/month, no card | yes |
| Adzuna | `GET api.adzuna.com/v1/api/jobs/in/search/1` | `app_id` + `app_key` | 25 free calls, then £8/month | no — paid |
| Careerjet Job Data API | `GET data.api.careerjet.net/v1/query` | API key | $2 per 1,000 calls | no — paid |

JSearch is the only free route to LinkedIn- and Indeed-sourced Indian postings:
it already holds the redistribution rights, and RapidAPI issues a key on signup
with no card. The free plan is a hard 200 requests a month, so it is a
supplement to the open boards, not a replacement.

Verified 2026-11-19: Jooble returns 403 Cloudflare without a key; Careerjet
returns 401 `Invalid API key`; Adzuna returns 401 `AUTH_FAIL`. All four
endpoints are live; only the first two are free.

Adzuna takes `max_days_old=7`, so the seven-day freshness rule would be applied
at source rather than after download — kept for reference if the paid tier is
ever enabled.

### Paid and not available at any price

| Service | Why |
|---|---|
| LinkedIn Talent Solutions | Enterprise contract only; no self-serve jobs API. |
| Indeed Publisher | Programme closed to new applicants. |
| Glassdoor API | Partner-only; no public access. |
| Naukri API | Enterprise partnership only. |
| Tracxn | Commercial licence. |

## Tier 4 — Funded startup discovery (public data)

| Source | Use | Access |
|---|---|---|
| Inc42 | Funding announcements | Public pages / RSS |
| Entrackr | Funding rounds | Public pages |
| Startup India / DPIIT | Recognised startups | Open data |
| Investor portfolios | Backed companies | Public pages |
| Tracxn | Deep company data | Commercial licence — not used without one |

Workflow: funding news → company → website → careers page → ATS detection → job extraction.

## Policy record shape

Every connector must carry:

```ts
type SourcePolicy = {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  discovery: "api" | "public-feed" | "crawl" | "user-session" | "none";
  submission: "agent" | "user-directed" | "manual" | "none";
  auth: ("google" | "linkedin" | "password" | "otp" | "sso")[];
  robotsReviewedAt: string;   // ISO date
  termsReviewedAt: string;
  notes: string;
};
```

A connector that cannot fill this record does not ship. `LEVER_POLICY` in
`packages/job-discovery` is the first one.

## What is still unknown

- Cutshort's real login path and auth methods.
- Apna's login methods (page is a JS shell).
- Whether Naukri's OTP is SMS or email — decides if a human must always be present.
- Each platform's exact apply-form field set. Phase 0 captures these.
