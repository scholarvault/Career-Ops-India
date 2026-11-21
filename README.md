# Career-Ops India

AI job discovery, matching and application operations for the Indian market.

**Status:** M1 in progress. The onboarding prototype is complete; the five packages exist and the loop runs end to end with no browser and no AI.

## What this is

Three connected systems:

1. **Discovery** — Indian portals, company career pages, ATS feeds, and newly funded startups.
2. **Career intelligence** — your CV, your preferences, and the adjacent roles you are actually qualified for.
3. **Application** — a tailored CV, a filled form, and a submission with a captured confirmation.

It is **not** a blind auto-apply bot. It automates where a platform permits it, and assists where it does not.

## Run it

```bash
pnpm install
pnpm demo        # discover → score → career paths → application plan
pnpm ui          # app + API on http://localhost:4173 (foreground)
pnpm start       # same, but detached - survives closing the terminal
pnpm stop        # stops whatever is on 4173
pnpm mcp         # MCP server on stdio (for Claude Desktop, Cursor, any client)
pnpm test:extract  # resume extraction regression, in a real browser
pnpm typecheck
```

`pnpm demo` hits Lever's public API, scores the real ValGenesis posting in
Chennai, and builds an application plan. It never submits.

## The apply console

`http://localhost:4173/console.html` is the primary surface. Seven steps:

1. **Connect** — upload the master resume, name the target role, confirm the
   contact details forms ask for.
2. **Market** — the funnel for that role: India, remote, a state, a city, last
   7 days. Then role families (core, one step up, adjacent, specialisation).
3. **Pick** — 10 recommended, not all. Every application costs model tokens and
   the candidate's attention.
4. **Tailor** — one resume per job, saved as a PDF with a hash.
5. **Apply** — the queue. When a site needs an OTP, an unknown field, a login or
   a captcha, the question appears in the console; the answer is typed into the
   form and the run continues. A captcha or a password is a handover to
   `browser.html`, never a solve.
6. **Learn** — what the agent remembers per site: flow, fields, answers, wins.
7. **Overview** — submitted with confirmation, parked, failed, and a CSV export.

The same flow is exposed to other agents as MCP tools (`pnpm mcp`) and as a
Skill at `.agents/skills/career-ops-apply/SKILL.md`, so Claude, ChatGPT and
Codex can drive it without the page.

`pnpm ui` now runs `server/index.ts`, not a static file server. It serves the
pages and a real API:

| Route | What it does |
|---|---|
| `GET /api/connectors` | Probes every job source and returns live status, count and latency. |
| `POST /api/jobs` | Runs discovery across all sources, filters to India, scores with `scoreJob`, returns postings. |
| `GET/POST /api/settings` | AI provider, model and base URL. |
| `POST /api/settings/key` | Stores the BYOK key in `data/secrets.json`. Never returned. |
| `POST /api/ai/test` | One small call to prove the key works. |
| `POST /api/explain` | Two sentences from the configured model: why the posting fits, and the gap. The score is never sent back. |
| `POST /api/tailor` | One real Sarvam call: 12–15 posting keywords with `inResume`, a rewritten summary, 6–8 competencies, experience reordered with rewritten bullets, and the gaps it refuses to add. Returns `coverage` as a counted percentage. |
| `POST /api/fill` | Opens the employer's form in the embedded browser at a Lever / Greenhouse / Ashby / SmartRecruiters posting, fills the visible fields from the confirmed profile, and leaves it open. Never submits. |
| `POST /api/fill/close` | Clears the fill page from the browser panel. |
| `POST /api/job-detail` | Reads an Indeed posting page on demand, returns the full description and re-scores it with the same `scoreOne` used by discovery. |
| `GET /api/browser/status` | Whether the embedded browser is open, and where. |
| `POST /api/browser/open` | Opens a URL in the shared Chrome (`profile: "indeed"` for the Indeed profile). |
| `GET /api/browser/frame` | A JPEG of the current page, for the panel in `ui/browser.html`. |
| `POST /api/browser/input` | Forwards a click, scroll, keystroke or resize to the page. |
| `POST /api/browser/navigate` / `back` / `close` | Address bar, history and shutdown. |
| `POST /api/browser/control` | `{ paused: true }` hands the page to the user; every connector refuses to drive it until `false`. |
| `GET /api/naukri/status` | Whether a Naukri token is on disk, and whether an OTP is pending. |
| `POST /api/naukri/login` | Email/phone + password. Returns `needsOtp` when Naukri wants a second factor. The password is never stored. |
| `POST /api/naukri/otp` | Verify a code, or `{ resend: true }` to send a new one. |
| `POST /api/naukri/search` | Naukri's own search endpoint, signed with `nkparam`. No browser. |
| `POST /api/naukri/apply` | One-click apply on a Naukri-hosted posting, refused when the daily cap is reached. |
| `GET /api/naukri/history` | What Naukri itself thinks you applied to, for reconciling the log. |
| `POST /api/naukri/logout` | Delete the token from disk. |
| `GET /api/audit` | The append-only application log, plus today's cap state. |
| `POST /api/audit` | Record one application (`via: api \| browser \| manual`). |
| `GET /api/cap` | `used`, `cap`, `remaining`, `blocked` for today (IST). |
| `POST /api/ats/gap` | Deterministic ATS keyword gap between a resume and a job description. No model, no key. |
| `GET /api/forms` | The per-site form cache: which hosts have a remembered field list. |
| `POST/DELETE /api/settings/source-key` | Store or remove a free key for Jooble or Careerjet. |
| `GET/POST /api/resume` | The master resume, shared by the console, the workspace and MCP (`data/resume.json`). |
| `GET/POST /api/profile` | Target role, years and contact details (`data/profile.json`). |
| `POST /api/market/summary` | The funnel for a role: India, remote, state, city, last 7 days, plus role families and a shortlist. |
| `GET /api/sites`, `DELETE /api/sites?host=` | What the agent learned per site: flow, fields, saved answers, success count. |
| `POST /api/autoapply/start` / `stop` | Start or stop a batch. `mode: "submit"` fills and submits; `"fill"` only fills. |
| `GET /api/autoapply/status` | The queue, the confirmation text and the open question. |
| `GET /api/autoapply/events` | The same state over SSE, so the console updates without polling. |
| `POST /api/autoapply/answer` | Answer the open ask (an OTP, a field, or `done` after a handover). |
| `POST /api/autoapply/retry` | Requeue the jobs parked on a question and continue. |

### Configuration

`data/secrets.json` holds the key saved from the Connections page. It is
gitignored and never returned by the API. For a deploy, set `SARVAM_API_KEY`
instead — it wins over the file, so nothing depends on a secret on disk. Copy
`.env.example` to `.env`; the server loads it at start.

**Bring your own key.** Nothing is bundled. Without one the app still runs —
discovery, scoring and the workspace work; tailoring and explanation ask for a key.

### Your data stays on your machine

| What | Where | Committed |
|---|---|---|
| API key | `data/secrets.json` or `.env` | no |
| Profile, CVs, job files | `data/` | no |
| Browser sessions | `data/browser-profile*/` | no |
| Resume text | `data/resume.json` and browser `localStorage` | no |
| Target role and contact details | `data/profile.json` | no |
| Site memory (fields, answers) | `data/sites.json` | no |
| Tailored PDFs | `data/tailored/` | no |

`pnpm check:secrets` fails if a key or a real contact detail reaches a tracked
file, and `.githooks/pre-commit` runs it on every commit. Enable it once per
clone: `git config core.hooksPath .githooks`. See `SECURITY.md`.

Seven employer feeds are wired and verified with no key: Lever (ValGenesis,
Zeta, Mindtickle), Greenhouse (Groww, slice), Ashby (Navi, Atlan). The
Connections page at `/settings.html` shows their live status and the AI key.

### Free, no key, no signup

Six open JSON sources work the moment the repo is cloned: **Himalayas**,
**Remotive**, **Remote OK**, **Jobicy**, **Working Nomads** and
**Freelancer.com**. The five boards are global remote, so a posting is kept only
when its location allows India, APAC or "worldwide". On 2026-11-19 they returned
26 India-eligible postings between them with no account of any kind.
Freelancer.com is a project marketplace — contracts rather than salaries, open
to India — and returned 20 projects in 371 ms.

Upwork and Guru RSS return 403 to a server-side request. Fiverr,
PeoplePerHour, Truelancer, Twine and Contra publish HTML only, and Fiverr is a
gig marketplace (sellers list services), so it is not a job source at all.

Nothing in the default path costs money. Adzuna (25 free calls, then £8/month)
and the Careerjet Job Data API ($2 per 1,000 calls) keep their code but are
marked `paid` and filtered out of the settings API, so the app never calls them.
The Connections page lists them under "Paid — not used" with the price.

Three free keys are optional and dormant until pasted: **Jooble** (free on
request), **Careerjet publisher** (free, approval) and **JSearch** on RapidAPI
(200 requests/month, no card). JSearch is the only free route to LinkedIn- and
Indeed-sourced Indian postings.

### The pipeline

Every page shows the same seven stages:

```
Discover → Analyse → Recommend → Prepare → Apply → Track → Improve
```

Discover, Analyse, Recommend and Prepare are built. Apply is the current step:
the agent fills the form and the user approves the submission. Track and Improve
are the next milestone.

### Indian startups, straight from their own ATS

Indian startups post on their own careers page first. Those pages are public and
need no key, so 25 startup boards are wired alongside the global ones — Paytm,
Meesho, Hevo Data, Acceldata, Level AI, CRED, Zeta, Zeta Global, InMobi,
PubMatic, Zenoti, Netradyne, Glance, Druva, Groww, slice, Tekion, Sarvam AI,
NETGEAR, DDN, Snowflake, Atlan, Navi, Swiggy and Freshworks. That is 27 boards
and roughly 1,600 postings, of which about 850 name an Indian city.

SmartRecruiters is supported too, because Swiggy and Freshworks use it. Its list
call carries no description, so the India postings get one detail call each,
capped at 40 and run 8 at a time.

### Fortune 500 career portals

Big employers do not post on Indian boards first, and some do not post there at
all. Three of them publish a public JSON endpoint, so they are read directly:

| Company | Endpoint | India postings (2026-11-20) |
|---|---|---|
| Tesla | MokaHR social-recruitment API | 63 — Bengaluru 43, Mumbai 9, Pune 3, Chennai 3, Delhi 2, Hyderabad 1 |
| EPAM Systems | `careers.epam.com/api/jobs/v2/search` | 251 — Hyderabad, Bengaluru, Pune, Chennai, Coimbatore, Gurgaon |
| Amazon | `amazon.jobs/en/search.json` | 283 |

Workday covers most of the rest of the Fortune 500 (NVIDIA, Salesforce,
Mastercard, Intel, Cisco, Adobe, Qualcomm, Dell). Its CXS endpoint answers 429
to a plain HTTP call and to headless Chrome, so it runs through the app's real
Chrome profile and only when `CAREER_OPS_WORKDAY=1` is set. NVIDIA returns 261
India postings that way.

Scope rule: a company's postings are kept when they name an Indian city. When a
company has no Indian posting at all, its remote roles that do not name another
country are kept instead, so a big employer with no India office still appears
as a remote option.

Boards are warmed at server start and refreshed in the background
(stale-while-revalidate, 5-minute TTL, 6 refreshes at a time), so a page load
reads the cache instead of waiting on 27 hosts. A board that misses an 18-second
deadline is reported as timed out and retried on the next cycle.

The login-walled startup boards — Wellfound, Instahyre, Cutshort, Hirist,
iimjobs, YC Work at a Startup — need their own ADR before a connector is built.
See `docs/source-register/README.md`.

### LinkedIn, without scraping it

LinkedIn has no public jobs API, and its User Agreement bans crawlers. Scraping
it costs the user's account. So the app reaches LinkedIn-sourced listings
through aggregators that already hold a redistribution licence, and the user
supplies their own key:

| Source | Key | Free tier |
|---|---|---|
| Adzuna | App ID + app key | Instant, 25 test calls, then £8/month |
| Jooble | API key | Free on request, no card |
| Careerjet | Affiliate ID | Free publisher key, approval |

Each connector is dormant until a key is stored, and a bad key degrades to a
connector error rather than failing the search. Adzuna applies
`max_days_old=7` at source, so the freshness rule is enforced before download.
See ADR-015.

### Naukri, two ways

ATS feeds carry almost no non-engineering roles. Naukri carries 1,600+ Business
Analyst vacancies in Chennai alone. It has no public API and no paid key, so
there are two connectors and you pick per task.

**The API connector** (`ui/naukri.html`) talks to the endpoints Naukri's own web
app uses. It is free, needs no key, and costs no browser process:

- Sign in with email/phone and password, then the OTP Naukri sends. The password
  is used once and never written to disk; only the resulting token is, at
  `data/naukri-session.json` (mode 0600).
- Search and one-click apply run over HTTPS. No Chrome, no 750 MB.
- Requests are signed with `nkparam`, the same RSA parameter Naukri's client
  sends. It is undocumented, so it can break; the browser connector is the
  fallback and the UI says which one answered.
- It needs a home IP. Datacenter ranges get MFA-blocked, which is a Naukri
  policy, not something to work around.

**The browser connector** drives the Chrome already on the machine, with a
persistent profile in `data/browser-profile`:

- You sign in once, in the window it opens. The agent never reads the password.
- Headless Chrome is blocked by Akamai, so the window is visible. That is also
  what makes the one-time sign-in possible.
- A captcha or a login wall returns `needsHuman` and the UI hands control back.
- It reads search results only. It does not submit applications.

### Guardrails, because "auto-apply" is a footgun

Four things sit between a click and an application leaving the machine.

| Guard | What it does |
|---|---|
| Daily cap | `CAREER_OPS_DAILY_CAP` (default 25) per IST day. A failed attempt does not consume it. `GET /api/cap` is the number the UI shows. |
| Audit log | Every send appends one JSONL row to `data/audit.jsonl`: when, where, which connector, what happened. Append-only, so the history cannot be quietly rewritten. |
| Take control | `POST /api/browser/control {paused:true}` makes every connector refuse to touch the page until you hand it back. For the OTP, the captcha, or the field it got wrong. |
| Pacing | A jittered delay between fields and a longer one before a navigation, serialised per host. `CAREER_OPS_PACE_MS=0` turns it off. |

### The answer bank

Onboarding step 6 collects the questions every ATS asks and no resume contains:
current and expected CTC, notice period, work authorisation, phone, PIN, links,
and the EEO block. They are stored locally and reused by the form filler, so a
Greenhouse form is not four minutes of typing every time. All of it is optional;
an empty answer is skipped, never guessed.

### ATS keyword gap

`POST /api/ats/gap` compares a resume against a posting with a fixed vocabulary
of ~300 skill terms and a log-weighted score. No model, no key, no network. It
returns what matched, what is missing, and the capitalised terms it did not
recognise so you can judge those yourself. It never writes anything into the
resume — adding a keyword you cannot defend is worse than the gap.

### Headless runs

`pnpm ci --role "Product Manager" --city Chennai --out report.json` runs
discovery without a window, writes a JSON report sorted by score, and exits
non-zero when nothing came back. Browser-backed sources are off unless you pass
`--sources public,naukri,indeed`, so a cron job never opens Chrome.

### MCP

`pnpm mcp` starts a JSON-RPC server on stdio with four tools:

| Tool | What it does |
|---|---|
| `search_jobs` | Live Indian postings, scored, matched-first. |
| `score_job` | The deterministic 100-point score for one posting. |
| `list_connectors` | Every source, its auth and its state. |
| `plan_application` | Field-by-field plan plus the approval gate. |

Register it in an MCP client:

```json
{
  "mcpServers": {
    "career-ops-india": {
      "command": "node",
      "args": ["node_modules/tsx/dist/cli.mjs", "server/mcp.ts"],
      "cwd": "<absolute path to this repo>"
    }
  }
}
```

The MCP server and the HTTP API both call `server/lib/discovery.ts`, so a tool
call and a page load cannot disagree about a posting or a score.

## Read

- [Plan](docs/PLAN.md) — locked decisions, milestones, risks.
- [Decisions](docs/decisions.md) — the ADRs behind them.
- [Architecture](docs/architecture/README.md) — packages, contracts, scoring.
- [AI registry](docs/ai-registry.md) — capability → model mapping.
- [Source register](docs/source-register/README.md) — what each platform allows.
- [UI research](docs/ui-research/google-career-dreamer.md) — the reference we built from.

## Layout

```
packages/contracts          shared Zod schemas and types
packages/career-profile     resume → extraction → profile draft
packages/career-taxonomy    Indian role graph and career paths
packages/career-scoring     deterministic 100-point match
packages/job-discovery      ATS feeds and career pages
packages/application-agent  form detection → plan → approval gate
ui/                         static HTML prototype (ui-sdk, no build step)
scripts/demo.ts             the end-to-end loop
docs/                       plan, decisions, architecture, research
data/                       local profile, jobs, applications (gitignored)
```

## Principles

- The user signs in on the real site. We never store a platform password.
- A blocked page is a human hand-off, never a bypass.
- A tailored CV never contains a fact the original did not.
- "Submitted" requires a confirmation, not a click.
- The score is computed by code; the model only explains it.

## Licence

AGPL-3.0-or-later. If you run a modified version as a network service, you must
publish your changes. See `LICENSE`.

