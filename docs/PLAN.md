# Career-Ops India — Plan

## Goal

A user goes from *"Product Manager roles in Chennai"* to a reviewed, tailored application submitted on a permitted source — and we know it worked because **one real application completes end to end with a confirmation page captured, and the job's source, score, CV version and evidence are stored.**

## Locked decisions

These are settled. Changing one needs a new entry in `docs/decisions.md`.

| Decision | Choice | Why |
|---|---|---|
| Architecture | TypeScript monorepo, local-first | One runtime. Playwright, PDF parsing and Sarvam's REST APIs all run in Node. |
| Workspaces | pnpm | Fast, strict, workspace protocol. |
| Web app | Next.js + TypeScript | Already the house stack. |
| Local agent | Node.js + TypeScript | Playwright is native here. |
| Browser automation | Playwright | Deterministic, inspectable, no model in the loop. |
| AI browser fallback | Browser Use | Only when a form defeats selectors. |
| Database | SQLite locally, PostgreSQL in cloud | Local-first; cloud holds public data only. |
| Validation | Zod | One schema shared by every engine. |
| PDF / DOCX | pdfjs-dist / Mammoth | No native binary. |
| OCR | Sarvam Vision / Doc AI | No local model to ship. |
| Intelligence | DeepSeek through Sarvam | Configurable per capability, not hard-coded. |
| AI billing | Sarvam included by default, BYOK as override | First run must work with no key. ADR-011. |
| Discovery | Firecrawl | Crawling only. Never submission. |
| Background jobs | Redis / BullMQ | Cloud-side discovery only. |
| Errors | Sentry | — |

**Local-only, never uploaded:** original resume, extracted profile, tailored resumes, browser sessions, platform auth sessions, application documents.

## The principle

> Career-Ops must never apply to a job using information the candidate has not verified or authorised.

Every design choice below follows from that sentence.

## Source policy

| Source class | Discovery | Submission |
|---|---|---|
| Company ATS — **Lever**, Ashby, Greenhouse, Workable | Public API — automated | Agent fills and submits (ADR-024); pauses for OTP/captcha |
| Company career pages | Crawl | Same |
| Funded startups (Inc42, Entrackr → site → careers) | Automated | Same |
| Naukri, Instahyre, Cutshort, Hirist, Apna | User-directed, from the user's own session | Agent fills and submits where built (ADR-024); pauses for OTP/captcha |
| **Indeed India** | Live in the shared Chrome profile (ADR-021); posting read on demand | Apply hands off to the employer's ATS; agent fills and submits (ADR-024) |
| LinkedIn | Link only | Opened and prefilled; user submits (ADR-015) |

**Naukri and Indeed run in the user's own Chrome profile.** Auto apply fills and submits, and pauses for an OTP, captcha or login (ADR-024).

## Phase 4 proof case

**Lever → ValGenesis → Platform Product Manager, AI/ML → Chennai.**

Verified 2026-11-19 against `https://api.lever.co/v0/postings/valgenesis?mode=json`:

| Field | Value |
|---|---|
| Posting id | `acbc0284-0bb8-42e4-9fd1-fa3583cb458f` |
| Title | Platform Product Manager, AI/ML |
| Location | Chennai |
| Commitment | Full-Time |
| Department | Product Management |
| **Posted** | **2026-04-08** |
| **First seen by us** | **2026-11-19** |
| Description | 9,197 chars across 3 lists |

The seven-month gap between posted and first-seen is the freshness problem in one row. We store both and never present one as the other.

Lever's submission endpoint needs an employer-side API key we cannot obtain, so the loop is: discover via API → score → tailor → open the public form → fill → **user submits**.

## Milestones

### M1 — Complete onboarding *(current)*

Role → Responsibilities → Resume → Verify profile → Preferences → Career paths.

- **Files:** `ui/index.html`, `packages/career-profile`
- **Done when:** a profile JSON exists, every field traces to a resume line, and the user has confirmed it.
- **Verify:** upload a real CV; no field appears that is not in the CV.

### M1.5 — Career map completion → workspace *(prototype done)*

The user had nowhere to go after step 6. Now: approved paths become search titles,
then discovery, then a scored list, then a prepared application.

- **Files:** `ui/map.html`, `ui/workspace.html`, `ui/apply.html`
- **Done when:** the four pages link end to end and carry state through `sessionStorage`.
- **Verify:** `index → map → workspace → apply` with no dead end and no invented data.
- **Still to do:** the pages are static. Wiring them to the packages is M2/M3 work.

### M1.6 — Occupation search *(prototype done, importer pending)*

The role field is a search, not a fixed list. ADR-012.

- **Files:** `ui/index.html`, `packages/career-taxonomy`
- **Done when:** any typed title resolves to exact, alias, specialisation or related, and an unknown title is accepted as a custom role.
- **Verify:** `Business Analyst` returns the six BA titles and nothing from Product or Engineering; `Quantum Computing Research Scientist` returns zero matches and still continues.
- **Still to do:** the prototype index is 55 hand-written titles. The real importer reads NCO 2015, then ESCO, then O*NET.

**Source links, checked 2026-11-19:**

| Source | URL | Note |
|---|---|---|
| NCO 2015 downloads | `https://dge.gov.in/nco-2015` | **no `www.`** — the cert covers `dge.gov.in` only |
| NCO 2015 search | `https://dge.gov.in/nat` | 556 rows, family dropdown, NCO 2015/2004/1968 |
| NCO Vol I PDF | `https://dge.gov.in/sites/default/files/2024-05/National_Classification_of_Occupations_Vol_I-2015.pdf` | 7.1 MB, **no `www.`** |
| ESCO | `https://esco.ec.europa.eu/en/about-esco/what-esco` | 3,039 occupations, 13,939 skills |
| ESCO API | `https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api` | v1.0.9 default, v1.2.0 latest |
| O*NET | `https://www.onetcenter.org/database.html` | current release **31.0, Aug 2026** |

**Licences:** O*NET CC-BY 4.0. ESCO reusable under Commission Decision 2011/833/EU with the
attribution statement. **NCO 2015 states no licence** — resolve before importing.

### M2 — Career intelligence

Taxonomy, 100-point deterministic score, evidence-based tailoring.

- **Files:** `packages/career-taxonomy`, `packages/career-scoring`
- **Done when:** scoring runs with no browser and no network.
- **Verify:** same CV + JD scores the same twice; a tailored CV contains no fact absent from the original.

### M3 — First ATS integration

Lever → ValGenesis → extract → score → tailor → inspect the form.

- **Files:** `packages/job-discovery`
- **Done when:** the real posting is discovered, scored and planned.
- **Verify:** `pnpm demo` prints the posting, the score and the plan.

### M4 — Local application agent

Open the authenticated browser → fill supported fields → validate → preview → **user submits**.

- **Files:** `packages/application-agent`
- **Done when:** one real submission has a confirmation screenshot.
- **Verify:** the record says `submitted` only with evidence.

### M5 — Startup discovery

Funding announcements → company → official site → careers page → job extraction.

## What is already working

`pnpm demo` runs the whole loop with no browser and no AI:

```
discover (Lever) → score → career paths → application plan → submission gate
```

Output on 2026-11-19: 13 postings, 11 in Chennai/remote, ValGenesis scored **76.3/100** as a `specialisation`, plan filled 5 fields and 1 upload, gate correctly blocked on two unanswered required questions.

## Verification

| Milestone | Proof |
|---|---|
| M1 | Every extracted field traces to a CV line |
| M2 | Deterministic score; tailored CV has no new facts |
| M3 | `pnpm demo` prints source, posted date, first-seen date |
| M4 | One real submission with a confirmation screenshot |
| M5 | A funded startup's job reaches the database with its source chain |

**Regression check:** the sibling `Job AI` repo keeps working. This project reads from it; it never writes to it.

## Risks

| Risk | Likelihood | Impact | Mitigation | Stop trigger |
|---|---|---|---|---|
| Platform changes its DOM | H | M | One connector per source; dry-run test each | Two connectors break in a week |
| Account flagged for automation | M | H | Auto apply submits; no evasion; 10/day cap; 30-90 s spacing | Any warning from a platform |
| OTP blocks a connector | H | M | Ask in the apply console; the batch parks that job and continues | A connector needs OTP every run |
| Tailoring invents facts | M | H | Diff against source CV; block on new entities | Any invented fact reaches a submission |
| Scope creep into 15 portals | H | H | MVP cut is fixed | A new portal lands before M4 passes |
| Sarvam model unavailable | L | M | Capability registry + fallback model | Two failed runs in a row |

## Rollback

- Code: `git revert`. The repo started empty, so any milestone can be dropped whole.
- Data: `data/` is local and gitignored.
- No production data, no deploy, no third-party write before M4.
- M4 writes only to the user's own browser session and local `data/`.

## Out of scope

- LinkedIn automation. Prohibited.
- CAPTCHA solving or stealth evasion.
- A hosted multi-tenant service. This is local-first.
- Payment, visa or demographic answers generated by a model.
- Replacing career-ops. This project reads its outputs.

## Open questions

1. **Sarvam account:** which models are provisioned — Vision, Doc AI, DeepSeek Flash/Pro? The registry (`docs/ai-registry.md`) needs the real IDs.
2. **Naukri:** does the owner accept the grey area before M5? They decide.
3. **Salary data:** which source is reliable enough to show a range? Until then, compensation scores neutrally.
