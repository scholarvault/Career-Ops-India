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

### foundit (user session, ADR-034)

| Source | How | Auth | Wired |
|---|---|---|---|
| **foundit** | its search page's own `/middleware/jobsearch` JSON, read in the Career-Ops window | the user's sign-in (OTP, email, Google) | yes |

No public API. `server/connectors/foundit.ts` opens foundit's search page for
the role and city in the user's signed-in profile and reads the JSON that page
loads, then up to three more pages through the page's own request, a beat
apart. Measured 2026-11-28: 70 postings for "product manager" in Chennai, 15 a
page. `datePosted` is foundit's `createdAt`; postings without a named
employer are dropped; apply uses the employer's own link when foundit gives
one. A bot check hands over. Runs only when the user is signed in to foundit.

### Apna (public page, ADR-035)

| Source | How | Auth | Wired |
|---|---|---|---|
| **Apna** | its public role-and-city page (`/jobs/product_manager-jobs-in-chennai`), one request with an honest user agent | none to search; the user's OTP sign-in to apply | yes |

Apna renders its search on the server, so the page arrives with the cards in
it (title, employer, city, salary, work mode, experience). Measured 2026-11-28:
25 Product Manager vacancies in Chennai. Each job's own page is then read for
its schema.org JobPosting: address, posted date and description (its PIN code
is the city's head post office for every job, so it is not used). The
signed-in page is not used to search: it swaps the query for Apna's own picks,
and its "Within 10 km" filter returned telecaller and delivery roles for a
Product Manager search.

### The user's own web search (ADR-035)

Find → Search the web sends the user's words to Firecrawl (`/v2/search`,
`includeDomains`, optional `tbs`) or TinyFish (`include_domains`,
`after_date`), limited to employer career sites, the Indian boards, or one
board. The same keep rules as Live apply, plus: a city, a board name or a
bracketed note is never taken as the employer.

### Wellfound (user session, ADR-036)

| Source | How | Auth | Wired |
|---|---|---|---|
| **Wellfound** | `/role/l/<role>/india` opened in the Career-Ops window; listings read from the page's own data (`__NEXT_DATA__` Apollo state) | the user's sign-in | yes |

Plain requests are blocked. Measured 2026-11-28: 30 Product Manager listings
with company (from the StartupResult that lists each), locations, remote flag,
pay, years and `liveStartAt` as the posted date. Its Chennai page ignores the
city, so India is read and the city is scored. Runs when signed in.

### Indeed: the check is handed to the user mid-search (ADR-036)

When Indeed shows its check during a streamed search, that tab is moved
on-screen in the Career-Ops window, the page is told, and the search waits up
to 60 s for the user to pass it, then reads the results. Noticed in about 10 s
(it took 53 s). Nothing passes the check for the user.

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

### Career-site search (user supplies a key)

Most Fortune 500 employers post their India roles on Workday, SuccessFactors,
Oracle, Taleo, iCIMS, Eightfold or Phenom pages that refuse a plain HTTP call
and publish no public JSON board. A search API that has already indexed those
pages is the legal way to reach them (`server/connectors/websearch.ts`).

| Source | Endpoint | Key | Cost | Wired |
|---|---|---|---|---|
| **Firecrawl** | `POST api.firecrawl.dev/v2/search` | Bearer `fc-…` | Free plan, 1,000 credits a month, no card | yes |
| **TinyFish** | `GET api.search.tinyfish.ai/` | `X-API-Key` | Free within a daily allowance | yes |

Endpoints checked against the providers' docs on 2026-11-28. Both are limited
to `CAREER_HOSTS`. A result is kept only when its URL is a single posting
and its title or snippet names a place in India. `datePosted` is never set,
because a search index does not know when the employer posted the role.
Submission is user-directed. The posting opens on the employer's own site.

#### Indian job boards through the same search (ADR-031)

foundit, Shine, TimesJobs, Instahyre, Cutshort, Hirist, iimjobs, Internshala,
Apna, Wellfound and Freshersworld are reached only through the search index:
one more Firecrawl query (about 4 credits) and one more TinyFish page, limited
to `BOARD_HOSTS`. The app uses the title, snippet and link the engine already
holds and never opens or crawls a board page to discover. A result is kept
only when it is a single posting (a listing title such as "1,240 jobs in
Chennai" is dropped), names a place in India and names an employer. Each job
carries the board as its source, so Find shows "foundit", not "Firecrawl".
Applying opens the posting on the board; the user signs in there once from
Sources (`server/lib/jobsites.ts`). Auto apply runs on these boards with the
same engine as employer sites (ADR-031, amended): it submits only after a
confirmation it can store, and stops for an OTP, a captcha, a login or a
question it cannot answer from the user's own answers. A board's terms may
limit automated use; the account risk is the user's, and the user turns it
on. LinkedIn stays fill-only (ADR-015).

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
