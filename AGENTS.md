# Career-Ops India

AI job discovery, matching and application operations for the Indian market.
Owner: ScholarVault.

## Read first

1. `docs/PLAN.md` — locked decisions, milestones, risks.
2. `docs/decisions.md` — the ADRs. Do not reverse one silently.
3. `docs/architecture/README.md` — packages, contracts, scoring.
4. `docs/source-register/README.md` — what each platform allows.

## Hard rules

- **Never collect a platform password.** The user signs in on the real site; the session stays on their machine.
- **Never bypass a bot check.** No CAPTCHA solving, no fingerprint spoofing, no proxy rotation to evade a block. A blocked page is a human hand-off.
- **No automated submission on LinkedIn or Indeed.** Their terms prohibit it.
  Discovery on Indeed India is allowed and live (ADR-021): it runs in the shared
  browser profile and reads public search pages. Apply is the user's click.
- **One browser, owned by the server.** `server/lib/browser.ts` holds the only
  persistent context. Connectors borrow a tab with `withPage()`; they never
  launch or close a browser of their own. `ui/browser.html` streams that browser
  into the app (ADR-022).
- **Naukri is user-directed in the MVP.** Do not add automation without a new ADR.
- **Never invent CV facts.** Tailoring reorders and rewrites what exists; it never adds a skill, employer, metric or certification. `POST /api/tailor` enforces this in the prompt and returns anything missing as `gaps`.
- **Apply fills, it does not submit.** `POST /api/fill` writes the confirmed profile into an employer's own ATS form (Lever, Greenhouse, Ashby, SmartRecruiters), then hands the user to `browser.html` with the filled form on screen. It never presses submit, and it never guesses current CTC, notice period or a motivation answer — only an expected CTC the user typed themselves.
- **Never mark an application "submitted" on a click alone.** Require a confirmation page or message, and store the evidence.
- **The model never produces a score.** `scoreJob` is deterministic; the model writes the explanation.
- **"Assessed", never "Verified"** for anything a model inferred.
- **No secret in source.** A key lives in `data/secrets.json` (gitignored) or
  `SARVAM_API_KEY` in `.env` (gitignored). Never hard-code one, never log one,
  never return one from an API. No real person's name, email, phone or handle
  in a fixture, a demo or a comment — use `example.com` data.
  `pnpm check:secrets` enforces this and runs in `.githooks/pre-commit`; a
  finding blocks the commit. The repository is public under AGPL-3.0
  (ADR-023), so a committed key is a published key — rotate, do not just delete.

## Stack

- pnpm workspace. TypeScript, run with `tsx`. Node ≥ 22.18.
- Next.js for the dashboard (not built yet). Node + Playwright for the local agent.
- Zod for every shared structure.
- Sarvam (DeepSeek) over REST for extraction, explanation and tailoring.
- Local-first: profile, sessions, CVs and job files live in `data/`, gitignored.

## Packages

| Package | Owns |
|---|---|
| `@career-ops/contracts` | Every shared type and schema. Change here first. |
| `@career-ops/career-profile` | Resume text → extraction → profile draft. |
| `@career-ops/career-taxonomy` | Role graph, adjacency, career paths. |
| `@career-ops/career-scoring` | The 100-point score. Pure. |
| `@career-ops/job-discovery` | Source connectors. |
| `@career-ops/application-agent` | Form plan and approval gate. |

A package may import `contracts`. Nothing else may import another package's
internals — only its public entry.

## Commands

```bash
pnpm install
pnpm demo        # the end-to-end loop, no browser, no AI
pnpm ui          # onboarding prototype on :4173
pnpm test:extract  # resume extraction regression, real browser, no server
pnpm check:secrets # no key, no real contact detail in a tracked file
pnpm typecheck   # must pass before any commit
```

## UI

- `ui/` holds static HTML prototypes with **ui-sdk**, no build step.
- Before using ui-sdk, follow the ui-sdk skill if installed, and read https://ui-sdk.dev/web.md.
- Each component registers its tags the first time they appear. Load it with:
  ```html
  <script type="module" src="https://ui-sdk.dev/web.js"></script>
  <link rel="stylesheet" href="https://ui-sdk.dev/web.css" />
  ```
- ui-sdk defaults to `light-dark()`; force `color-scheme: light` and map the `--ui-*` tokens to the page palette.
- Prototypes are the source of truth for layout and copy; the Next.js app ports them.

## Conventions

- Every job carries `sourceUrl`, `datePosted` (or absent) and `firstSeenAt`. Never merge the last two.
- Every extracted fact carries an evidence span. No span, no field.
- A connector that cannot fill a `SourcePolicy` record does not ship.
- Tests: `pnpm typecheck` is the floor. Add a test when a rule is load-bearing.
- **Resume extraction is load-bearing.** A change to `findName`, `findExperience`,
  `findLinkedIn` or `findEducation` in `ui/index.html` must keep
  `pnpm test:extract` green. Adding a resume shape means adding a fixture to
  `scripts/test-extraction.mjs`. Never flatten a PDF to plain text to parse it:
  the geometry is what separates a name from a stat label (ADR-019).
