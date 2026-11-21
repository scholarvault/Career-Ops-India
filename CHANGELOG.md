# Changelog

All notable changes to Career-Ops India are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-21

### Added

- **Apply console** (`ui/console.html`): a seven-step flow — connect, market,
  pick, tailor, apply, learn, overview — that replaces the browser panel as the
  main surface. The browser is now opened only for a captcha or a password.
- **Ask-and-resume engine** (`server/lib/asks.ts`, `server/lib/autoapply.ts`):
  the queue asks for an email, a one-time code, a radio choice or an unknown
  field in the console, waits for the answer, fills it and continues. An
  unanswered ask parks that job and the batch moves on.
- **Site memory** (`server/lib/sites.ts`, `data/sites.json`): each host keeps
  its flow, field map and the answers you gave, so the next form on that site
  needs fewer questions.
- **Market funnel** (`server/lib/market.ts`): counts for All India, Remote,
  state and city, plus role families (core, adjacent, alternative,
  specialisations, trending) and a shortlist.
- **Location filter** in the workspace: 25 states plus Remote, persisted.
- **Tailored resume store** (`server/lib/tailored.ts`): one PDF per job with a
  sha256 guard, saved under `data/tailored/`.
- **Shared profile store** (`server/lib/profile-store.ts`): `data/profile.json`
  and `data/resume.json` are reused by the console and the MCP server.
- **MCP server** (`server/mcp.ts`): 15 tools that expose the same flow to
  Claude, ChatGPT and Codex — search, score, market summary, shortlist,
  tailor, start/stop/answer/resume a batch, and site memory.
- **Skill** (`.agents/skills/career-ops-apply/SKILL.md`) for agents that do not
  speak MCP.
- **Landing page**: a static page with no build step, deployed to Cloudflare
  Pages at career-ops-india.pages.dev. It is not tracked in this repository.
- **Serve scripts** (`scripts/serve.mjs`, `scripts/stop.mjs`): `pnpm start`
  runs the server detached, `pnpm stop` stops it.
- **ADR-025** describing the console, asks, site memory and the MCP surface.

### Changed

- The workspace "Apply" action and header button now open the console; the
  browser page is a handover view.
- `requiresApproval` is a boolean and `PlanInput` takes `autoSubmit`, so a
  batch can submit without a per-job approval gate.
- ADR-020, ADR-013 and ADR-021 no longer claim the app never submits.
- `findRole` matches whole words and phrases, so short aliases such as "PO",
  "PM" and "BA" no longer pull in unrelated titles.
- Untailored jobs in a batch are skipped instead of blocking the run.

### Removed

- ADR-005 and ADR-007, which blocked the new design.
- The "separate tracks" family; unrelated titles are dropped from the funnel.

## [0.1.0] - 2026-11-19

### Added

- Initial release: local job discovery, scoring, resume tailoring and a
  browser workspace.
