# Career-Ops India

Find the roles you actually fit, tailor a resume for each one, and apply with
you in the loop — on Indian job boards, company career pages and ATS forms.

**Live site:** https://career-ops-india.pages.dev

## Who it is for

- Job seekers in India who are tired of applying into a void.
- People switching roles, not just titles — the app shows the adjacent roles
  your experience already covers.
- Anyone who wants to see and approve every application, not hand a bot their
  inbox and hope.

## What it does

- **Discovers** postings from Indian boards, company career pages, ATS feeds and
  remote job boards.
- **Scores** every posting against your resume with a fixed 100-point model, so
  the ranking is the same every time.
- **Shows the market** for a role: all India, remote, a state, a city, the last
  seven days, and the role families around it.
- **Tailors** one resume per job, saved as a PDF.
- **Applies** with you in the loop: it fills the form, asks only when it must,
  and records the confirmation the site showed.
- **Learns** each site, so the next form on that site needs fewer answers.

```mermaid
flowchart LR
  A[Discover] --> B[Score]
  B --> C[Market]
  C --> D[Pick]
  D --> E[Tailor]
  E --> F[Apply]
  F --> G[Learn]
```

## Quick start

You need Node 22+, pnpm and Chrome.

```bash
pnpm install
pnpm start        # app + API on http://localhost:4173
pnpm stop         # stop it
```

Open **http://localhost:4173/console.html** for the apply console.

```bash
pnpm demo         # discover, score and plan one real posting, no submit
pnpm mcp          # MCP server on stdio, for Claude, ChatGPT or Codex
pnpm typecheck
pnpm test:extract # resume extraction, in a real browser
```

## The apply console

Seven steps, one screen each:

1. **Connect** — upload your master resume, name the target role, confirm the
   contact details forms ask for.
2. **Market** — the funnel for that role, then the role families: core, one step
   up, adjacent, specialisation, trending.
3. **Pick** — 10 recommended by default. Every application costs model tokens
   and your attention, so "all" sits behind a warning.
4. **Tailor** — one resume per job, saved with a hash.
5. **Apply** — the queue. An email, a one-time code, a choice or an unknown
   field is asked in the console, typed into the form, and the run continues.
6. **Learn** — what the agent remembers per site: flow, fields, answers, wins.
7. **Overview** — submitted with confirmation, parked, failed, and a CSV export.

The browser opens only for a captcha or a password. It is never the main
surface.

## What it connects to

| Kind | Sources |
|---|---|
| Indian boards | Naukri, Indeed India — through your own signed-in browser session |
| ATS | Lever, Greenhouse, Ashby, SmartRecruiters |
| Company career pages | Indian startups and large employers that publish a public feed |
| Remote boards | Himalayas, Remotive, Remote OK, Jobicy, Working Nomads, Freelancer.com |
| LinkedIn | Through licensed aggregators with your own key — never scraped |

Most sources need no account. A few need a free key you paste once. Nothing in
the default path costs money.

## Guardrails

| Guard | What it does |
|---|---|
| Daily cap | A fixed number of submissions per day. A failed attempt does not use one. |
| Audit log | Every send is appended to a local log: when, where, what happened. |
| Pacing | A jittered delay between fields and before navigation. |
| Take control | One switch makes every connector stop touching the page. |
| Captcha | Never solved. You clear it in the browser and hand it back. |
| OTP | Never stored. It is used once, in the run that asked for it. |

A blocked page is a hand-off, never a bypass. "Submitted" requires the site's
confirmation, not a click.

## Other agents

The same flow is available without the page:

- **MCP** — `pnpm mcp` starts a server with tools for search, scoring, the
  market summary, shortlisting, tailoring, running a batch, answering a
  question, resuming a batch and reading site memory.
- **Skill** — `.agents/skills/career-ops-apply/SKILL.md` for agents that do not
  speak MCP.

## Your data

Your files stay on your machine. The app does not upload them anywhere except
the AI provider you configure, and only when you tailor or explain a posting.

| What | Where |
|---|---|
| API key | `data/secrets.json` or `.env` |
| Resume, profile, contact details | `data/resume.json`, `data/profile.json` |
| Tailored PDFs | `data/tailored/` |
| Site memory | `data/sites.json` |
| Browser sessions | `data/browser-profile*/` |
| Application log | `data/audit.jsonl` |

`data/` is gitignored. `pnpm check:secrets` fails if a key or a real contact
detail reaches a tracked file. Enable the pre-commit hook once per clone:

```bash
git config core.hooksPath .githooks
```

## Bring your own key

Nothing is bundled. Without a key the app still discovers, scores and plans;
tailoring and explanations ask for one. Set it in the app's settings, or set
`SARVAM_API_KEY` in `.env` for a deploy.

## Docs

- [Plan](docs/PLAN.md) — decisions, milestones, risks.
- [Decisions](docs/decisions.md) — the ADRs behind them.
- [Architecture](docs/architecture/README.md) — packages, contracts, scoring.
- [Source register](docs/source-register/README.md) — what each platform allows.
- [Changelog](CHANGELOG.md) — what changed in each release.

## Licence

AGPL-3.0-or-later. If you run a modified version as a network service, you must
publish your changes. See `LICENSE`.
