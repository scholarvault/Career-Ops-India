# Decisions

One entry per decision that is expensive to reverse. Newest last.

---

## ADR-001 — TypeScript monorepo, not Python + FastAPI

**Date:** 2026-11-19
**Status:** accepted

The blueprint proposed FastAPI + Next.js. Rejected.

Playwright, PDF parsing, DOCX parsing and Sarvam's REST APIs all run in Node. Python would add a second runtime, a second dependency tree, a second deploy target and an API contract to keep in sync — for a one-person team, that is the whole budget.

**Revisit if:** we need local OCR or a local embedding model. Then add a Python sidecar for that one job, not a second app.

---

## ADR-002 — Local-first, with a local desktop agent

**Date:** 2026-11-19
**Status:** accepted

Resume, profile, tailored CVs, browser sessions and platform auth stay on the user's machine. The cloud may hold public job listings, company data and funding data.

**Why:** a hosted browser would mean storing user sessions server-side. That is both a security liability and the thing that gets accounts flagged.

**Consequence:** the dashboard never touches a browser. The agent never holds a password.

---

## ADR-003 — Never collect platform passwords

**Date:** 2026-11-19
**Status:** accepted

The user signs in to the real site in their own browser. We keep the session, not the credential.

**Consequence:** every connector must tolerate a human sign-in step, and none may depend on a stored password.

---

## ADR-004 — No CAPTCHA solving, no stealth evasion

**Date:** 2026-11-19
**Status:** accepted

A blocked page is a human hand-off.

**Why:** evasion breaks on the next site update, breaches the platform's terms, and risks the candidate's account. The cost is not worth the application count.

---

## ADR-006 — Lever + ValGenesis proves the loop

**Date:** 2026-11-19
**Status:** accepted

Phase 4 / M4 is proven on the ValGenesis *Platform Product Manager, AI/ML* posting in Chennai.

**Why:** it is real, it is in the target city, it is a genuine stretch for the candidate (so the score is meaningful), and Lever's public API gives us discovery without a key.

**Constraint:** Lever's submission endpoint needs an employer-side API key. So we discover via API and submit through the public form.

---

## ADR-008 — Model capability registry, not hard-coded models

**Date:** 2026-11-19
**Status:** accepted

Each capability names a provider and a model ID in config. Switching models must not require a code change.

**Why:** we cannot verify the account's provisioned model list from here, and model names change.

See `docs/ai-registry.md`.

---

## ADR-009 — Deterministic score, AI explanation

**Date:** 2026-11-19
**Status:** accepted

The 100-point score is computed by code. The model writes the explanation after the number is fixed.

**Why:** a raw LLM score is not reproducible, not auditable and drifts between runs. A candidate cannot act on a number that changes when nothing changed.

**Consequence:** `scoreJob` is pure. Same inputs, same output, always.

---

## ADR-010 — Five packages, one shared contract

**Date:** 2026-11-19
**Status:** accepted

`career-profile`, `career-taxonomy`, `career-scoring`, `job-discovery`, `application-agent`, all consuming `@career-ops/contracts`.

**Why:** every engine must read the same confirmed profile rather than re-extracting from the resume. One schema is the only way to guarantee that.

**Consequence:** a change to `Profile` is a change to every package, by design.

---

## ADR-011 — Sarvam is the included default; BYOK is the override

**Date:** 2026-11-19
**Status:** accepted

Three tiers, in this order:

| Tier | What it is | Who it is for |
|---|---|---|
| **Included** (default) | Our Sarvam key, server-side proxy, per-user daily quota | Everyone on first run |
| **BYOK** | Sarvam, OpenAI, Anthropic, Google, OpenRouter, or a custom OpenAI-compatible base URL | Anyone who wants their own model or their own spend |
| **None** | Deterministic path only | Air-gapped, or quota exhausted |

**Why the default is ours:** a first-time user in India does not have a Sarvam account. If the first screen asks for an API key, most leave before seeing a single match. DeepSeek v4.1 Flash through Sarvam is ₹14/M input and ₹55/M output — a full onboarding plus 50 job explanations is roughly ₹2–4 per user. That is cheaper than one support ticket from someone stuck on key setup.

**Why it is not a lock-in:** ADR-008 already binds per capability, not per app. Switching to a user's key is a config change on that binding. Nothing else moves.

**Controls on our key:**

1. Server-side proxy. The key never reaches the browser. No `localStorage`, ever.
2. Per-user daily quota, enforced server-side.
3. `maxCostPaise` per call — already in `ModelBinding`.
4. Degrade, don't block. Quota exhausted → the deterministic path still runs. Scores, taxonomy, career paths and application plans need zero model calls. The user loses the explanation and the tailoring, not the product.

**Separate connections:** AI provider keys and job-portal logins are different forms with different storage. Never one screen.

**Consequence:** the app must work end to end with no key at all. Any feature that cannot degrade to the deterministic path is not allowed in the MVP.

---

## ADR-012 — Never block on an unclassified title

**Date:** 2026-11-19
**Status:** accepted

A user can enter any profession. If the taxonomy has no match, the product accepts the exact text and continues. It never shows an error and never refuses to search.

**Why:** an open-source product for every profession cannot ship a closed list. A Business Analyst who types their own title and sees Product Manager and Software Engineer concludes the product does not know their job, and leaves.

**Four layers, in order:**

1. **Exact title** — the typed text is a canonical title.
2. **Alias** — the typed text is a known synonym (`ba`, `pm`, `sde`).
3. **Specialisation** — the typed text appears as a whole-word phrase inside a longer title.
4. **Related** — the rarest typed word appears in the title, and at least half the words match.

Nothing matched → accept the text as a custom role, tagged `Custom role · AI classification pending`, and build the map from the resume later.

**Why the rarest word:** matching on any shared word makes "Data Analyst" return SOC Analyst and GRC Analyst on the word *analyst*. Weighting by document frequency keeps the distinctive word in charge.

**Taxonomy sources, in order of authority:**

| Layer | Source | Status |
|---|---|---|
| Standard occupations | NCO 2015 (India) | primary; licence unconfirmed |
| | ESCO | 3,039 occupations, 13,939 skills; reuse permitted under 2011/833/EU with attribution |
| | O*NET | supplementary; CC-BY 4.0; current release 31.0 (Aug 2026) |
| Indian market titles | discovered postings | enrich aliases over time |
| Custom roles | user input | always accepted |

**Consequence:** the taxonomy is data, not code. Adding a title is a row, not a release. Every imported dataset keeps its source and licence alongside it.

---

## ADR-013 — Naukri discovery runs in the user's own browser

**Date:** 2026-11-19
**Status:** accepted

Discovery is automated, because the ATS-only approach cannot
serve non-engineering roles: across seven verified employer boards, 2 of 72
postings mentioned "business analyst" at all, while Naukri lists 1,625 Business
Analyst vacancies in Chennai. Submission is handled by auto apply (ADR-024),
which pauses for an OTP, captcha or login.

**What was tried, in order:**

| Route | Result |
|---|---|
| `GET /jobapi/v3/search` with Naukri's public headers | `406 recaptcha required` |
| Plain HTTP fetch of the search page | 200, but an empty Next.js shell; cards are client-rendered |
| Headless Chrome (Playwright) | `Access Denied` from Akamai |
| Headed Chrome with a persistent profile | 20 cards, 1,625 total, title/company/experience/location/posted-age/job-id |

**Decision:** discovery uses `playwright-core` against the Chrome already
installed on the machine, with a persistent profile at `data/browser-profile`.

**Bounds that keep this inside ADR-003 and ADR-004:**

1. The agent never reads, stores or types a password. The user signs in on the
   real site, in the window the connector opens.
2. No captcha solving and no fingerprint spoofing. A captcha or login wall
   returns `needsHuman` and the UI hands control back.
3. Discovery only. The connector reads search results; it does not open an
   application form or submit anything.
4. Headless is not used, because Akamai blocks it. The visible window is a
   consequence of the block, not an evasion technique.
5. The profile directory is gitignored, like the rest of `data/`.

**Consequence:** the connector needs a desktop with Chrome or Edge installed.
On a machine without one it returns `no-browser` and the ATS feeds still work.
Every other session-based platform (Apna, Instahyre, Cutshort, Hirist, iimjobs,
Internshala) needs its own ADR before it is built.

---

## ADR-014 — One discovery module behind both the API and MCP

**Date:** 2026-11-19
**Status:** accepted

The HTTP API and the MCP server must not drift. Both call
`server/lib/discovery.ts`, which owns the board list, the India filter, the
role matcher, the scoring call and the dedupe.

**Why:** the first version of the role matcher counted a Group Product Manager
posting as a Business Analyst match because its marketing copy contained the
word "analysts". Two copies of that logic would have drifted and the MCP tool
would have disagreed with the page.

**Consequence:** a new source is added once, in `BOARDS` or as a connector, and
appears in the API, the UI and MCP together.

---

## ADR-015 — LinkedIn is reached through licensed APIs, never scraped

**Date:** 2026-11-19
**Status:** accepted

LinkedIn has no public jobs-search API. Its Talent APIs (Apply Connect, Job
Posting, Recruiter System Connect) are for ATS partners and recruiters posting
jobs, not for a candidate reading the board. Its User Agreement prohibits
crawlers, bots and browser plug-ins, and enforcement is an HTTP 999, an
authwall, or an account ban. Proxycurl, the largest commercial LinkedIn data
API, was shut down after litigation.

So "everyone has a LinkedIn connector" means one of two things: they scrape and
carry the ban risk, or they buy an aggregator that already holds a
redistribution licence.

**Decision:** we do neither of the first two. We ship keyed connectors for the
aggregators that license the listings — Adzuna, Jooble, Careerjet — and the
user supplies their own key. Each connector is dormant until a key is stored.

**Why:** the user's account is the asset we must not spend. A key is revocable,
attributable and legal; a scraped session is none of those.

**Consequence:**
1. `server/connectors/aggregators.ts` holds the three fetchers and a registry.
   A connector with no key returns `no key` and contributes nothing.
2. Keys live in `data/secrets.json` beside the AI key, are never returned to the
   page, and are removed with one click.
3. Adzuna filters by age at source (`max_days_old=7`), so the seven-day rule is
   enforced before the posting reaches us.
4. A bad key degrades to a connector error. It never fails the whole search.
5. LinkedIn and Indeed stay out of the automation path entirely: no discovery
   by scraping, no submission.

---

## ADR-016 — A board is cached for five minutes

**Date:** 2026-11-19
**Status:** accepted

`runBoard` keeps its last result for five minutes, keyed by board id.

**Why:** the workspace loads live feeds on boot. Seven ATS feeds plus Naukri took
34 s cold, and the slowest feed (Mindtickle's Lever board) alone took 28 s. A
reload paid that cost again for data that had not changed.

**Consequence:** a cold load is ~13 s and a reload ~5 s. `firstSeenAt` keeps the
time we first saw the posting, not the time of the cached read, so the
posted-versus-discovered distinction survives the cache.

---

## ADR-017 — 27 boards, served stale-while-revalidate

**Date:** 2026-11-19
**Status:** accepted

Indian startups post on their own ATS page first, so the board list grew from 7
to 27 (Lever, Greenhouse, Ashby, SmartRecruiters). Fetching 27 hosts inside a
page request does not work: the slowest Lever board alone takes 13–28 s.

**Decision:**
1. Boards are warmed once at server start.
2. A request reads the cache and returns immediately. If the entry is older than
   five minutes, a background refresh starts and the stale answer is served.
3. Refreshes run six at a time. Twenty-seven at once starved the event loop and
   made the page itself slow.
4. A board that misses an 18-second deadline is reported as timed out, keeps its
   last good postings, and is retried on the next cycle.
5. The list payload carries a 1,200-character `jd` excerpt, not the full
   description. Sending the full text for 856 postings produced a 7.6 MB
   response and a 12-second load; the excerpt is 1.6 MB and 3.3 s.

**Consequence:** a page load is 3.3 s warm and does not grow with the number of
boards. A board added tomorrow costs nothing at request time. The trade-off is
that a posting can be up to five minutes old, which is well inside the seven-day
freshness rule.

---

## ADR-018 — Free sources only; paid APIs are hidden, not removed

**Date:** 2026-11-19
**Status:** accepted

The product must work end to end for anyone who clones it, with no card and no
trial that expires. Adzuna stops being free after 25 calls and the Careerjet
Job Data API bills per call, so neither can be the default path.

**Decision:**
1. Five open JSON boards are wired with no key at all: Himalayas, Remotive,
   Remote OK, Jobicy and Working Nomads. They are global remote boards, so a
   posting is kept only when its location allows India, APAC or "worldwide".
2. Jooble, the Careerjet publisher API and JSearch stay, because all three issue
   a free key with no card. They remain dormant until the user pastes one.
   JSearch is the only free route to LinkedIn- and Indeed-sourced postings, at
   200 requests a month.
3. Adzuna and the Careerjet Job Data API keep their code but carry `paid: true`.
   The settings API filters them out, so the UI never offers them and discovery
   never calls them.
4. The settings page lists the paid services under "Paid — not used" with the
   price, so the exclusion is visible rather than silent.
5. A location that names another country is not an Indian job. The filter now
   recognises US states and the `XX-Country-Remote` form that Snowflake and
   others use; before this, "CO-Colombia-Remote" passed as remote.
6. Freelancer.com is wired as a sixth no-key source. It is the only major
   freelance marketplace with an open JSON API (`/api/projects/0.1/projects/active/`);
   Upwork and Guru RSS return 403, and Fiverr, PeoplePerHour, Truelancer, Twine
   and Contra publish HTML only. Fiverr is a gig marketplace — sellers list
   services — so it is not a job source. Freelance postings carry a budget, not
   a salary, and are marked `remote · worldwide`.

**Consequence:** a fresh clone returns Indian and India-eligible remote postings
with zero configuration. Coverage of the big Indian portals still depends on the
user's own session (ADR-013) or a free aggregator key, which is the honest
trade-off: those portals do not publish an open feed.

---

## ADR-019 - A resume is read from its text layer, with geometry; OCR is the fallback for scans only

**Date:** 2026-11-19
**Status:** accepted

A real two-page resume was read as `MANAGED GAIN USERS` for the full name, with
no title and no company. The reading was not the problem: the PDF carries an
exact text layer. The parser was. It flattened the page to plain text and then
guessed, so a stat label under a metrics grid looked exactly like a person.

**Decision:**

1. **The text layer is the source of truth.** `ui/vendor/pdf.min.js` (pdf.js)
   reads the characters the PDF already contains, in the browser, with no model,
   no key and no upload. DOCX goes through `ui/vendor/mammoth.browser.min.js`.
2. **Never flatten.** Each text run keeps its font size and x position.
   `segmentsOf` splits a line where the size changes or the gap is wide, so a
   designed page is read as columns. The name is the **largest type on page
   one**, split from the tagline beside it. A body-sized all-caps label can
   never win, whatever it says.
3. **OCR is not the fix for a text PDF, and is not used on one.** OCR
   re-recognises glyphs from pixels: it is slower, it is lossier, and it throws
   away the exact characters and the type sizes that make the name findable.
   Running Sarvam Vision on this file would have produced the same wrong answer
   more slowly, because the failure was downstream of the reading.
4. **OCR is the fallback for a scan.** A PDF with no text layer (a photo or a
   scan) yields nothing, and the step says so instead of inventing a profile.
   The planned fallback is Sarvam Vision 2.1, server-side, on explicit user
   action, with every field marked "assessed" rather than "verified". It is not
   wired yet; the honest behaviour today is to ask for a text-based PDF.
5. **The rule is enforced by a test, not by care.** `pnpm test:extract`
   (`scripts/test-extraction.mjs`) renders six PDFs, drives the real onboarding
   page in a real browser, and asserts the ten fields. One fixture is the exact
   trap: a 19 pt name sharing a line with a 7 pt tagline, above a grid of
   all-caps stat labels including `MANAGED GAIN USERS`. The suite serves `ui/`
   itself, blocks the ui-sdk CDN, and needs no API server, no network and no
   key. `CO_RESUME=<path>` adds the owner's own file with generic invariants
   (all fields found, the name is a name, the name is not a stat label) so the
   repository never carries anyone's personal data.

**Consequence:** a change to the parser that regresses the name, the title, the
company, the LinkedIn path or the education split fails a command, not a user's
onboarding. Adding a resume shape means adding a fixture, which is the point.

**Revisit if:** a majority of real uploads turn out to be scans. Then wire the
Sarvam Vision fallback behind the same test, with a fixture that has no text
layer.

---

## ADR-020 - Tailoring is a model call with a hard no-invention contract; Apply fills the employer's own form

**Date:** 2026-11-20
**Status:** accepted

The workspace had a "Tailor resume & prepare" button that opened a page of four
plausible-sounding changes nobody had computed, and an "Apply" button that only
opened Naukri. Both were theatre. A client cannot use either.

**Decision:**

1. **Tailoring is one real call, `POST /api/tailor`.** It sends the posting, the
   confirmed profile and the resume's own text to Sarvam and asks for one JSON
   object: 12–15 keywords with `inResume`, a rewritten summary, 6–8
   competencies, experience reordered with rewritten bullets, and a `gaps` list.
   The prompt's hard rules are the product: never invent an employer, title,
   date, degree, metric or skill; only rephrase, reorder and select what the
   resume already says; anything the posting wants and the resume lacks goes in
   `gaps`, never into the CV.
2. **The model is `sarvam-105b-conversations`, not `sarvam-105b`.** The
   reasoning model spends its whole token budget on `reasoning_content` for a
   long structured prompt and returns `content: null` with
   `finish_reason: "length"`. The conversations variant returns the same JSON in
   under a second. `sarvam-105b` remains the default for short explanations.
3. **The reply is parsed by structure, not by outer braces.** The model
   sometimes writes a malformed first attempt, leaks chat-template tokens, adds
   a "Constraints check" paragraph, then writes the object again. `pickJson`
   walks every balanced `{...}`, parses each, and keeps the last one that has
   `keywords` or `summary`. `repairJson` closes a string and brackets left open
   by the token limit. A failure returns a sentence a person can read, never raw
   model output.
4. **Coverage is counted, not asserted.** `coverage` is the share of the
   posting's keywords already present in the resume. The drawer shows the
   covered ones green and the missing ones red, and says the red ones stay out.
5. **The tailored resume is printed from the page.** One column, standard
   headings, selectable text, A4 — an ATS can read it. The original file is
   never modified.
6. **Apply fills the employer's own form.** `POST /api/fill` drives a headed
   Chrome at a Lever, Greenhouse, Ashby or SmartRecruiters URL, detects the
   visible fields, fills the ones the confirmed profile answers, and leaves the
   window open. Auto apply (ADR-024) adds the submit step; the manual path still
   stops at the filled form. Salary, notice period and "why this role" are never
   guessed and are reported as skipped.

**Consequence:** the pipeline is now Discover → Analyse → Recommend → **Tailor
(real)** → **Apply (real)** → Track → Improve. What remains manual is what must
remain manual: the salary and the motivation question.

**Revisit if:** a source changes its form markup often enough that detection
misses fields. Then add a per-ATS field map rather than loosening the generic
detector.

## ADR-021 - Indeed India is discovered through a real Chrome profile, never through its API

**Status:** accepted (2026-11-20)

**Context.** Indeed India was listed as "blocked by policy". That was wrong on
both counts: nothing in the terms forbids *reading* a public search page, and
the block was technical, not legal. Measured on 2026-11-20:

| Route | Result |
|---|---|
| `GET in.indeed.com/jobs` over plain HTTP | `403`, Cloudflare + captcha |
| `GET in.indeed.com/rss` | `404` — the feed is gone |
| `GET in.indeed.com/m/jobs` | `403` |
| Indeed Publisher API | closed to new applicants |
| Headless Chrome | `Blocked - Indeed.com` |
| **Headed Chrome, persistent profile** | **48 cards**, "25 Product Manager Job Vacancies in Chennai" |

**Decision.**

1. **Discovery runs in the shared headed Chrome** (ADR-022), in its own profile
   directory `data/browser-profile-indeed`. A separate profile is deliberate: a
   Cloudflare clearance cookie and a Naukri session must not invalidate each
   other.
2. **The home page is visited first.** A cold profile that goes straight to the
   search URL gets the interstitial; the clearance cookie lands on the home page
   and the search then renders.
3. **`fromage=7` is passed to Indeed itself**, so the freshness rule is enforced
   by the source as well as by us.
4. **The list card has no description.** A card is scored on its title and is
   flagged `partial: true`. `POST /api/job-detail` reads the posting page on
   demand, returns the full description and **re-scores it with the same
   `scoreOne` function** discovery uses, so a re-score cannot drift.
5. **Submission follows ADR-024.** Indeed's Apply button usually says
   "Apply on company site"; when the resolved URL is a Lever, Greenhouse, Ashby
   or SmartRecruiters host, auto apply fills and submits that form, pausing for
   an OTP, captcha or login.
6. **No sign-in is required to search.** If Indeed asks for a verification, the
   connector returns `needsHuman` and the browser panel waits for the user.

**Consequence.** Indeed India is a live source. Its scores are honest: title-only
until the posting is read, then real. `ui/settings.html` and `ui/map.html` no
longer say "blocked by policy".

**Revisit if:** Indeed changes the card markup, or starts requiring a sign-in to
search. Then the connector reports a layout change rather than guessing.

## ADR-022 - One browser, owned by the server, streamed into the app

**Status:** accepted (2026-11-20)

**Context.** Every browser-backed source used to launch its own Chrome window and
close it again. That produced two windows at once, a profile directory that only
one of them could use, and a sign-in the user had to repeat. The user asked for
the browser to live *inside* Career-Ops instead of opening a separate window.

**Decision.**

1. **`server/lib/browser.ts` owns one persistent context per profile directory.**
   Connectors borrow a tab with `withPage()` and close only the tab; the browser
   and its cookies stay warm.
2. **The window is real and headed, but parked off-screen**
   (`--window-position=-32000,-32000`). Cloudflare and Akamai both refuse
   headless, so a real window is not optional; hiding it is what makes it feel
   embedded.
3. **`ui/browser.html` streams it.** `GET /api/browser/frame` returns a JPEG of
   the current page; the page polls it and forwards `pointerdown`, `wheel` and
   `keydown` to `POST /api/browser/input`. Coordinates are mapped from the
   rendered image back to the page viewport using `naturalWidth`.
4. **An `<iframe>` is not used and cannot be.** Naukri and Indeed both send
   `X-Frame-Options`; a screencast is the only way to show the real page.
5. **New tabs are followed.** Naukri's Login opens one; the panel switches to the
   newest page so a click never appears to do nothing.
6. **`/api/fill` opens the employer's form in the same visible page**, so the
   filled fields appear in the panel rather than in a stray window.
7. **The panel never types a password for the user.** It forwards keystrokes to
   whatever the user focused; the password goes to the site, not to us.

**Consequence.** "Connect Naukri" now opens `browser.html?naukri=1`. The session
folder is unchanged (`data/browser-profile`), so the promise in ADR-013 still
holds: sign in once, reuse it, never store the password.

**Superseded in part by ADR-025:** the panel is no longer the primary surface.
It is the handover view for a captcha or a password; the apply console asks for
everything else in place.

**Revisit if:** the screencast is too heavy on a slow machine. Then drop the poll
interval or switch to CDP `Page.startScreencast`, which pushes frames instead of
re-encoding on request.




## ADR-023 - The repository is public under AGPL-3.0; a key and a person's data never enter it

**Status:** accepted, 2026-11-20.

**Context.** The project moves to a public GitHub repository. It is local-first:
the API key, the profile, the CVs and the browser sessions all live in `data/`
on the user's machine. A public repository makes two failure modes permanent:
a committed key is a published key, and a committed resume is a published
resume. Deleting the line later does not remove it from history.

**Decision.**

1. **Licence: AGPL-3.0-or-later.** The app can be run as a hosted service. AGPL
   requires anyone offering a modified version over a network to publish their
   changes, so the code stays open and the hosted product keeps its edge.
2. **Three tiers for a key, and no fourth.** `SARVAM_API_KEY` in `.env` for a
   deploy; `data/secrets.json` for local use, written by Settings; or nothing,
   in which case the AI features ask for a key. A key is never returned by an
   endpoint and never reaches the browser.
3. **`data/` is gitignored in full**, and `secrets.json`, `settings.json` and
   both browser profiles are listed again explicitly, so `git add -f data/`
   cannot leak them.
4. **`pnpm check:secrets` is a gate**, run by `.githooks/pre-commit` and CI. It
   fails on a key pattern, a private key block, an assigned credential, a real
   email address (anything not `@example.com`) and an absolute `C:\Users\<name>`
   path.
5. **Fixtures are synthetic.** No real name, employer, phone or handle in a
   test, demo, comment or doc. A new resume shape means a new synthetic fixture.
6. **The repository root is the project.** A `git init` at a home directory
   would stage every file the account owns; the root is checked before the
   first commit.

**Consequence.** A contributor clones, runs `pnpm install`, sets
`git config core.hooksPath .githooks`, and brings their own key. Nothing in the
repository is anyone's data. The one thing this cannot undo is a key that was
already pushed: rotation at the provider is the only fix, and `SECURITY.md`
says so.

**Revisit if:** the project needs a permissive licence for a specific
integration. That is a new ADR, not a quiet edit to `LICENSE`.

---

## ADR-024 - Auto-apply is a first-class mode, with tiers and an audit log

**Date:** 2026-11-21
**Status:** accepted

The owner asked for one-click auto-apply: pick jobs (top score or saved), and the
agent fills and submits each application with the tailored resume. This replaces
the old rule that the agent only fills and a person always presses submit.
ADR-015 (LinkedIn is never scraped) is unchanged; LinkedIn is opened and
prefilled, not submitted.

**Tiers:**

1. **ATS (Greenhouse, Lever, Ashby, SmartRecruiters):** fill and submit.
2. **Naukri and Indeed:** fill and submit, but pause for OTP, captcha, a login
   or a required field the profile cannot answer.
3. **LinkedIn:** open and prefill only. The user presses submit.

**Guardrails:**

1. A required field is never guessed. Salary, notice period and "why this role"
   stop the run and ask.
2. A captcha is never bypassed. The run asks the user to clear it, then
   continues.
3. Every submission writes `data/applications.jsonl` with the job id, URL,
   timestamp, mode, confirmation text and screenshot path.
4. The daily cap is 10. Jobs are spaced 30-90 seconds apart.
5. `CAREER_OPS_AUTOAPPLY=0` turns submit off and leaves fill-only.
6. A job already in `co.track` as applied is skipped.

**Consequence:** the Apply page no longer says "We do not submit this" when the
user starts an auto-apply run. The manual path still exists and still never
submits on its own.


## ADR-025 - The apply console replaces the browser panel; questions are asked in place

**Date:** 2026-11-21
**Status:** accepted

**Context.** Auto apply worked, but the only way to answer it was the live
browser panel: the run paused, the user found the field in a screencast, typed
into it, and pressed Continue. That is the interface the owner asked to
replace. It also meant an OTP, an email or a "notice period" question stopped
the whole batch, and nothing was learned from one form to the next.

**Decision.**

1. **`ui/console.html` is the primary surface.** Seven steps: Connect, Market,
   Pick, Tailor, Apply, Learn, Overview. `ui/browser.html` stays as the
   handover view for a captcha or a password, and is linked from the console.
2. **An ask is a first-class object.** `server/lib/asks.ts` holds a
   `PendingAsk` with an id, kind, input type, site and expiry. The run awaits a
   promise; `POST /api/autoapply/answer` resolves it. `GET
   /api/autoapply/events` streams the queue and the open ask over SSE.
3. **An expired ask parks that job and the batch continues.** One job that
   needs a code must not stop the other nine. Parked jobs are retried with
   `POST /api/autoapply/retry`.
4. **The agent learns each site.** `server/lib/sites.ts` writes
   `data/sites.json`: the sign-in flow, the field map, the answers the user
   typed, the last use and the success count. A saved answer is offered on a
   new form, never filled silently.
5. **Indeed's "Apply on company site" is followed.** The click can open a new
   tab on a new host; the run switches to that page and re-reads site memory
   for the new host.
6. **The same flow is exposed to other agents.** `server/mcp.ts` adds
   `upload_resume`, `set_target_role`, `market_summary`, `shortlist`,
   `tailor_batch`, `start_apply_batch`, `get_apply_status`, `answer_ask`,
   `resume_apply_batch`, `list_sites` and `forget_site`. The Skill lives at
   `.agents/skills/career-ops-apply/SKILL.md`.
7. **The resume and role are shared on disk.** `data/resume.json` and
   `data/profile.json` are written by the console and by MCP, so Claude and the
   page never disagree.

**Consequence.** A password is still never asked for or stored (ADR-003), a
captcha is still never solved (ADR-004), and an OTP is used once and dropped.
The browser panel is no longer the place a user types an email or a code.

**Revisit if:** a site's form is only usable through its own UI (a drag-and-drop
builder, a multi-page wizard with no stable selectors). Then the handover view
is the right answer for that site, and the ask card should say so.
