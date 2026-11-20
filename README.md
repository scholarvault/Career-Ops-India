# Career-Ops India

AI job discovery, matching and application operations for the Indian market.

**Status:** M1 in progress. The onboarding prototype is complete; the five packages exist and the loop runs end to end with no browser and no AI.

## What this is

Three connected systems:

1. **Discovery** — Indian portals, company career pages, ATS feeds, and newly funded startups.
2. **Career intelligence** — your CV, your preferences, and the adjacent roles you are actually qualified for.
3. **Application** — a tailored CV, a filled form, and a submission you approve.

It is **not** a blind auto-apply bot. It automates where a platform permits it, and assists where it does not.

## Run it

```bash
pnpm install
pnpm demo        # discover → score → career paths → application plan
pnpm ui          # app + API on http://localhost:4173
pnpm mcp         # MCP server on stdio (for Claude Desktop, Cursor, any client)
pnpm test:extract  # resume extraction regression, in a real browser
pnpm typecheck
```

`pnpm demo` hits Lever's public API, scores the real ValGenesis posting in
Chennai, and builds an application plan. It never submits.

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
| `POST/DELETE /api/settings/source-key` | Store or remove a free key for Jooble or Careerjet. |

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
| Resume text | browser `localStorage` | never leaves the browser |

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

### Naukri, through your own browser

ATS feeds carry almost no non-engineering roles. Naukri carries 1,600+ Business
Analyst vacancies in Chennai alone, but its search page is client-rendered and
its JSON API answers `recaptcha required`. So the connector drives the Chrome
already installed on the machine, with a persistent profile in
`data/browser-profile`:

- You sign in once, in the window it opens. The agent never reads the password.
- Headless Chrome is blocked by Akamai, so the window is visible. That is also
  what makes the one-time sign-in possible.
- A captcha or a login wall returns `needsHuman` and the UI hands control back.
- It reads search results only. It does not submit applications.

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

