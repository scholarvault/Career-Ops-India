# Auto Apply

Status: implemented 2026-11-21. ADR-024 records the decision; ADR-025 records
the apply console that replaced the browser panel as the primary surface.

## What shipped

| Piece | File |
| --- | --- |
| Location / state filter, with city aliases | `ui/workspace.html` |
| Tailored PDF store, hashed | `server/lib/tailored.ts`, `/api/tailored/*` |
| Queue, fill, submit, confirmation, audit, cap | `server/lib/autoapply.ts`, `/api/autoapply/*` |
| Auto apply button, saved batch, top-10 batch, queue panel | `ui/workspace.html` |
| Submit path and resume-after-gate | `server/lib/autoapply.ts` |
| Ask-and-resume engine (OTP, field, captcha, login) | `server/lib/asks.ts`, `/api/autoapply/answer`, `/api/autoapply/events` |
| Site memory (flow, fields, answers, outcomes) | `server/lib/sites.ts`, `data/sites.json`, `/api/sites` |
| Market funnel and role families | `server/lib/market.ts`, `/api/market/summary` |
| Shared master resume and target role | `server/lib/profile-store.ts`, `/api/resume`, `/api/profile` |
| Seven-step apply console | `ui/console.html` |
| MCP tools for the same flow | `server/mcp.ts` |
| Skill for Claude, ChatGPT and Codex | `.agents/skills/career-ops-apply/SKILL.md` |

Verified against a local mock form: the run opened the form, filled the profile
fields, asked for the OTP in the console, typed it, asked for "notice period"
and "why this role", saved both answers, submitted, and captured "Application
submitted". Site memory then showed `localhost · Email + OTP · 6 fields · 1
success`. A second run on the same job was skipped as a duplicate. The audit
log and the daily cap were written on the submission.

The rest of this document is the design rationale that led there.

## Goal

The user picks jobs (top 10 by score, or the saved list) and one click fills and
submits each application with the tailored resume. The run asks only for an
OTP, a captcha, a login, or a required field nobody can answer, and it asks in
the console rather than sending the user to a browser tab. History shows
exactly what was submitted, with the confirmation text.

Success condition: 10 applications submitted, each with a captured confirmation,
no required field guessed, no duplicate, and a stop button that works.

## Current state (confirmed)

| What | Where | Behaviour today |
| --- | --- | --- |
| Form fill | `server/connectors/fill.ts:243` | Opens the employer form in the persistent browser, fills known fields, leaves the page open. It never presses submit (`fill.ts:5-7`). |
| Browser | `server/lib/browser.ts:203` | One persistent Chrome profile (`data/browser-profile`). Sign in once, cookies survive. |
| Human gates | `server/lib/browser.ts:267` | `pageState()` already detects OTP, password, captcha and consent. |
| Pacing | `server/lib/pace.ts:25` | Jittered field delays, one run per host at a time. |
| Apply UI | `ui/apply.html:614` | ATS detection, then `/api/fill` at `:657`. Auto apply adds submit (ADR-024). |
| Workspace filters | `ui/workspace.html:1573` | `visible()` filters saved, fresh, score, source, query; sorts newest/score/match. |
| Sort control | `ui/workspace.html:1337` | Best match, Newest first, Highest score. |
| Detail actions | `ui/workspace.html:1976` | Tailor resume and prepare, Open original, Save. |
| Browser panel | `ui/browser.html` | Live view plus click/type/scroll over `/api/browser/*`. |
| Driver | `package.json` | `playwright-core ^1.65.1`, installed Chrome. |

## The decision this changes

The old rule was that the agent only fills and a person always presses submit.
That rule is gone. ADR-024 records the replacement: tiers, cap and audit log, so
the change is explicit rather than a quiet contradiction.

ADR-013 (Naukri discovery in the user's browser) and ADR-015 (LinkedIn is never
scraped) still hold. LinkedIn is opened and prefilled, never submitted.

## Constraints

- No official apply API exists for Naukri, LinkedIn or Indeed. Browser automation
  is the only route.
- LinkedIn's User Agreement prohibits automated applying. Account ban risk is real.
- Never guess a required field: salary, notice period, "why this role" stay blank
  and stop the run.
- One persistent browser profile. The user signs in once; no password is stored.
- Local app, no cloud queue. The Node server runs the queue while it is up.
- No new dependency. Use `playwright-core` and the installed Chrome.
- The existing `/api/fill` contract must keep its "never submit" behaviour.

## Options

### Connector: Google OAuth vs one-time sign-in

**A. Google connector.** Gives Gmail and Calendar, not apply rights. It does not
help with Naukri, LinkedIn or Indeed. Its only use here is reading an OTP email.

**B. One-time sign-in in the app's browser profile.** Reuse
`data/browser-profile`. The user signs in to Naukri, Indeed and Google once; the
cookies persist. Works for every portal and every company site.

Recommendation: **B**. Flip to A only if you also want OTP auto-read from Gmail,
and even then A is added for Gmail only, never for applying.

### Submit mode: everywhere vs tiered

**A. Auto-submit everywhere.** Fastest, highest ban risk, and LinkedIn is the
most likely account to be restricted.

**B. Tiered.**
- Tier A, ATS (Greenhouse, Lever, Ashby, SmartRecruiters): full auto-fill and
  auto-submit. No login needed.
- Tier B, Naukri and Indeed: auto-fill and auto-submit, but pause for OTP,
  captcha or an unknown required field.
- Tier C, LinkedIn: open and prefill only, never submit.

Recommendation: **B**. Flip only if you accept the LinkedIn ban risk; I would
still keep LinkedIn manual.

## Plan

Each phase is shippable on its own. Phases 1 and 2 are safe and reversible.
Phase 5 is the one-way door.

### Phase 0 - Decision (no code)

Write ADR-024 in `docs/decisions.md`: tiers, cap, audit log, kill switch.
Checkpoint: you approve this document.

### Phase 1 - Location filter (safe, reversible)

Files: `ui/workspace.html`.

- Add a `Location` select next to `#sort`: All India, Remote, then states
  (Tamil Nadu, Karnataka, Telangana, Maharashtra, Delhi NCR, Haryana, Uttar
  Pradesh, West Bengal, Gujarat, Kerala, Andhra Pradesh, Rajasthan, Madhya
  Pradesh, Punjab, Odisha, Assam, Uttarakhand, Goa, Chandigarh).
- Add `filters.state` and `STATE_ALIASES`: Chennai, Coimbatore, Madurai,
  Tiruchirappalli -> Tamil Nadu; Bengaluru -> Karnataka; Hyderabad -> Telangana;
  Pune, Mumbai, Nagpur -> Maharashtra; Gurugram, Faridabad -> Haryana; Noida,
  Greater Noida -> Uttar Pradesh; Kolkata -> West Bengal; Ahmedabad -> Gujarat;
  Kochi, Thiruvananthapuram -> Kerala.
- `stateOf(job)` reads `job.location`, then `job.title`, then `job.jd`.
- `visible()` filters on it. Show the selected state as a chip. Persist in
  `co.filters`.

Checkpoint: selecting Tamil Nadu shows only Tamil Nadu jobs; the count updates;
the choice survives a reload.

Verify: Playwright at 1440 px and 390 px; Tamil Nadu count matches a manual
count of the list.

### Phase 2 - Tailored resume store and PDF

Files: `server/lib/tailored.ts` (new), `server/index.ts`, `ui/workspace.html`,
`ui/apply.html`.

- `POST /api/tailored/save` with `{ jobId, data, html }` writes
  `data/tailored/<id>.json` and prints `data/tailored/<id>.pdf` with Playwright
  `page.pdf()`.
- `GET /api/tailored/<id>` returns `{ exists, data, pdf }`.
- Tailor success saves automatically. The Apply page and the auto-apply engine
  read the stored PDF.
- Store `pdfSha256` in the JSON so a stale PDF cannot be attached.

Checkpoint: tailor one job, the PDF exists, opens, and its hash matches.

### Phase 3 - Auto-apply engine, fill-only

Files: `server/lib/autoapply.ts` (new), `server/connectors/fill.ts` (export the
detection helpers), `server/index.ts`.

- `applyOne({ job, tailored, profile, mode: "fill" })` opens the URL, detects the
  form, fills it, uploads the PDF, screenshots the result, and returns
  `{ filled, skipped, needsHuman, screenshot }`.
- Reuse `detectAll`, `fillFields`, `openForm` and `looksLikeApplication`.
- Unknown required field -> `needsHuman: "fields"` with the labels. Never guess.
- OTP, captcha or login -> `needsHuman` from `pageState`.
- Non-ATS company forms: send the detected field list plus the profile to Sarvam
  and get a selector-to-value map. Still no submit in this phase.

Checkpoint: the top 10 are filled, 10 screenshots exist, zero submissions.

### Phase 4 - UI

Files: `ui/workspace.html`, `ui/apply.html`, `ui/browser.html`.

- Detail sticky bar: `Auto apply` next to `Open original`.
  - Not tailored -> label "Tailor first", opens the drawer.
  - Tailored -> "Auto apply", starts one job.
- Saved view: `Auto apply saved (N)` button.
- Confirmation card: the list, the count, a checkbox "These are real
  submissions", and Start.
- Queue panel: per-job status (queued, filling, needs you, submitted, failed,
  skipped) and Stop.
- Needs-you state: OTP, captcha or unknown field, with the browser panel and an
  input. The run continues after the answer.

Checkpoint: one job end to end in fill mode, started from the button.

### Phase 5 - Submit mode, audit and cap

Files: `server/lib/autoapply.ts`, `server/index.ts`, `docs/decisions.md`.

- `mode: "submit"` clicks submit only when there is no gate and every required
  field is filled.
- Verify the confirmation text ("application submitted", "thank you",
  "received") or a URL change. Only then mark applied.
- `data/applications.jsonl`: job id, URL, timestamp, mode, confirmation,
  screenshot path.
- Cap 10 per day in `data/apply-cap.json`; 30-90 s between jobs; stop after 3
  consecutive failures on one host.
- `CAREER_OPS_AUTOAPPLY=0` disables submit and the UI shows "Fill only".

Checkpoint: one real ATS submission, confirmation captured, History updated.

### Phase 6 - Dry run, top 10

Highest score, first 10, fill-only, screenshots. Show the list and the results.
No submissions.

Checkpoint: you review the list and the filled forms.

### Phase 7 - Real run, top 10

Same list, submit mode, after your confirmation. Stop on any needs-you and
resume after the answer.

Checkpoint: 10 confirmations, or a clear reason for each failure.

## Verification

- Unit: state mapping, queue order, cap, dedupe by job id and URL.
- Integration: a local mock Greenhouse form -> fill, submit, confirmation.
- Real: one ATS job first, then the batch.
- Regression: `/api/fill` still never submits; the Apply page is unchanged
  unless the new button is used; History still shows saved, tailored, ready and
  submitted independently.

## Risks

| Risk | Likelihood | Impact | Mitigation | Stop trigger |
| --- | --- | --- | --- | --- |
| Portal account restricted | Medium | High | Tiering, pacing, cap, no LinkedIn submit | A challenge, warning or 999 appears |
| Wrong value in a required field | Medium | High | Never guess; stop and ask | A required field has no answer |
| Duplicate application | Medium | Medium | Dedupe by id and URL; check `co.track` | The job is already applied |
| Form markup changes | High | Medium | Per-host cache, LLM fallback, screenshot | 3 failures in a row on one host |
| OTP or captcha blocks the queue | High | Medium | Pause and ask; never bypass | The batch stops, session kept |
| Stale PDF attached | Low | High | Store the hash with the PDF | Hash mismatch |
| Legal or ToS complaint | Medium | High | Opt-in, audit log, no LinkedIn | The user's account is flagged |

## Rollback

- Set `CAREER_OPS_AUTOAPPLY=0`; the UI falls back to fill-only.
- Delete `data/apply-queue.json`, `data/applications.jsonl`, `data/tailored/*`
  and `data/apply-cap.json` to clear the new state.
- Revert the touched files. The folder is not a git repo, so keep a copy of each
  file before editing.
- Submitted applications cannot be undone. The dry run and the per-batch
  confirmation are the guard, not the rollback.

## Out of scope

- LinkedIn auto-submit. ADR-015 stays.
- Captcha bypass.
- Creating accounts on company sites.
- Reading Gmail for OTP automatically. Pause and ask instead.
- Workday's multi-step flow. Phase 2 of this feature.
- Mobile layout for the queue. Desktop first.

## Open questions

1. LinkedIn: confirm open-and-prefill only, no submit? Recommended: yes.
2. First real run: dry run then submit, or submit directly? Recommended: dry run.
3. Daily cap: 10? Recommended: 10.
4. Naukri and Indeed: auto-submit with an OTP gate, or fill-only? Recommended:
   auto-submit with the gate.
