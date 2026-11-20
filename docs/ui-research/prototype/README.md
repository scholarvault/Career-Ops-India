# UI prototype

Four pages, ui-sdk from a CDN, no build step.

Run `pnpm ui` and open http://localhost:4173.

| File | What it is |
|---|---|
| `ui/index.html` | Onboarding — six steps, any profession |
| `ui/map.html` | Career map completion — approve the search titles |
| `ui/workspace.html` | Job discovery — scored postings, master/detail |
| `ui/apply.html` | Prepare application — tailoring, form, approval gate |

The journey is `index → map → workspace → apply`. State moves through
`sessionStorage` under `co.onboarding`, `co.map` and `co.job`.

## Onboarding screens

| File | Step |
|---|---|
| `01-role.png` | Target role |
| `02-responsibilities.png` | Transferable responsibilities, three selected |
| `03-resume.png` | Resume drop |
| `04-verify.png` | Confirm what was read |
| `05-preferences.png` | Location, work mode, level |
| `06-career-paths.png` | Career Path Explorer |
| `07-done.png` | Summary |

## What changed after the review

| Point | Change |
|---|---|
| **A. Second question** | Now *"Which of these responsibilities have you performed in your previous roles?"* — no longer tied to the target title. Subtext names founders, analysts, operations and project leads. |
| **B. Bottom navigation** | Footer is fixed; the scroll area reserves its height plus 56 px. Role chips moved to two columns so all seven fit above the fold. Verified: last chip bottom 629 px, footer top 794 px — no overlap. |
| **C. Selection feedback** | Selected = light-blue fill, 2 px blue ring, medium weight, blue text, filled check circle. Unselected = grey, hollow ring. |
| **D. Regeneration** | Keeps every selected responsibility and rotates the unselected pool by a third of its length, so the change is visible. Verified: 5 of 10 chips change on one click; selections survive. |
| **Progress** | Zero completed steps on step 1, one on step 2. Bar = `(step − 1) / 6`. |
| **E. Role field** | Was a fixed list of 12 popular titles. Now a search over 55 canonical titles with aliases, four match layers, and a `Use "X"` fallback. Business family added. |
| **F. No personal data** | The hardcoded `SAMPLE_FACTS` block is gone. Step 4 renders only what the uploaded file contains; with no file it shows an empty state. The apply screen uses a labelled demo persona. |
| **G. Upload state** | `empty → reading → ready → removed`. Ready hides the drop zone and shows the file card with **Remove**; Remove restores the drop zone and clears the facts. |
| **H. Motion** | Step entrance staggers title/sub/body 100 ms apart on `cubic-bezier(0.2, 0, 0, 1)`; content animates transform only, so a throttled tab never shows a blank step. Reduced motion gets a fade. |
| **I. One source for role data** | `ui/data.js` now holds the families, the occupation index and the sample postings. Onboarding, the career map and the workspace all read `window.CO`, so they cannot disagree about which role you picked. |
| **J. Workspace follows the role** | The workspace no longer ships a fixed Product Manager list. `CO.jobsFor(family, role)` returns the product set (with the one real ValGenesis posting), a family set for Business / Data / Engineering / Design / Marketing / Security, or a set built from the title you typed when the taxonomy has no family. Verified: Business Analyst → 5 BA postings; Data Analyst → 5 data postings; Quantum Computing Research Scientist → 5 postings carrying that title; Product Manager → the real ValGenesis posting is back. |
| **K. Map and apply follow it too** | `map.html` builds its path table from `CO.FAMILIES[family].paths` and redirects to onboarding when nothing was saved. `apply.html` reads the job from `co.job`, derives the tailoring bullets from that posting's skills, and names the tailored file after the company and role. |
| **L. Mobile** | Under 900 px the detail pane becomes a full-screen panel with a **← All jobs** button instead of being hidden. Under 640 px the header wraps and the search takes its own row. Verified at 390 px: no horizontal overflow on any of the four pages. |
| **M. Real postings, not samples** | The workspace calls `POST /api/jobs` on load. ATS feeds alone carry almost no Business Analyst roles, so the Naukri connector reads the live search page in the local Chrome profile. Verified: Business Analyst, Chennai → 18 real Naukri postings, matched first, then 69 other roles at the same companies. |
| **N. Matched / other split** | When some postings match the role and some do not, the list shows two labelled sections — *18 Business Analyst postings* and *69 other roles* — instead of one undifferentiated list. |
| **O. Role matcher tightened** | A Group Product Manager posting was counted as a Business Analyst match because its marketing copy said "industry analysts". The title now decides: two- and three-word roles must appear whole in the title, and seniority words are ignored. |
| **P. Dates from every source** | Naukri sends a full timestamp, ATS feeds send a bare date. Both now render correctly; before, Naukri postings showed `Invalid Date` and `posted NaN months ago`. |
| **Q. Connections page** | `/settings.html` shows the AI provider and BYOK key, the live connector table, the manual sources, and the MCP server with a copyable client config. |
| **R. Seven-day freshness** | A posting older than 7 days is treated as expired. The list opens with **Last 7 days** on, so a three-month-old listing never appears by default; **All dates** brings them back with a red "older than 7 days" note. Verified: 20 of 87 live postings pass, 0 stale rows. |
| **S. Sarvam model fixed** | The stored model `deepseek-v4.1-flash-1017` is rejected by Sarvam's chat endpoint (`should be one of sarvam-105b, sarvam-105b-conversations`). The default is now `sarvam-105b`, old settings files are migrated on load, and the error shows the allowed names instead of raw JSON. Verified: test connection returns 200 in 243 ms. |
| **T. The model actually writes** | `POST /api/explain` sends the posting, the confirmed skills and the score breakdown to the configured provider and returns two sentences. The workspace calls it for the selected posting and caches the answer. Verified with the Sarvam key: 4.3 s, real text, score untouched. |
| **U. Header at 390 px** | The longer **Last 7 days** label pushed the header row past the viewport (439 px wide at 388 px). The header controls now wrap onto their own full-width row under 640 px. Verified: `scrollWidth` 388 = `clientWidth` 388. The tailored-file row in `apply.html` also got `min-width: 0` so the filename ellipsises instead of overflowing. |
| **V. "Connecting…" was a dead end** | The pill said only *Connecting…* for 34 s with no sign of life. It now shows a pulsing dot and a live clock (`Connecting… 12s`), the list header says *Loading live postings…*, and the note walks through four stages. A 180 s client timeout turns a hang into a retry prompt. Verified: `Connecting… 2s` → `Live · 88`. |
| **W. Cold load 34 s → 13 s** | Two causes. Naukri ran *after* the ATS feeds instead of beside them, and every board was re-fetched on every page load. Boards now run in parallel with Naukri and each board result is cached for five minutes. Verified: cold 12.6 s, warm 5.4 s, same 91 postings. |
| **X. Licensed job APIs** | Adzuna, Jooble and Careerjet are wired as keyed connectors in `server/connectors/aggregators.ts`, with a key box each on the Connections page. Dormant without a key; a bad key shows as a connector error and the search still returns. Verified: fake Adzuna key → `HTTP 401 AUTH_FAIL` on that row only, 20 Naukri postings still returned. |
| **Y. 27 boards, 3.3 s** | The board list grew from 7 to 27 with Indian startups read from their own ATS (Paytm, Meesho, Hevo, Acceldata, Level AI, CRED, InMobi, PubMatic, Zenoti, Netradyne, Glance, Druva, Tekion, Sarvam AI, Swiggy, Freshworks and more). SmartRecruiters was added as a fourth ATS kind. Two fixes made it usable: boards warm at start and refresh behind the request (stale-while-revalidate, 6 at a time, 18 s deadline), and the payload sends a 1,200-character excerpt instead of the full description. Verified: 7.6 MB / 12 s → 1.6 MB / 3.3 s, 856 postings, 27 of 27 boards live. |
| **Z. Salary when the source states it** | The Careerjet Job Data API returns `salary_min`, `salary_max`, `salary_currency_code` and `salary_type`. `formatSalary` turns those into `₹12.0–18.0 LPA` and the row shows it in place of the work mode. Nothing is estimated: no salary fields, no salary shown. |
| **AA. Free sources, and the pipeline** | Five open JSON boards are wired with no key: Himalayas, Remotive, Remote OK, Jobicy and Working Nomads (`server/connectors/remote.ts`). They are global remote boards, so a posting is kept only when its location allows India, APAC or "worldwide". Verified: 26 India-eligible postings with no account. Adzuna and the Careerjet Job Data API are marked `paid`, filtered out of `/api/settings`, and listed under **Paid — not used** with their price. The Connections page now opens with the seven-stage pipeline, and the MCP table shows Sarvam as **live**. Verified: 33 of 35 connectors live, 1,659 postings, 881 in India; 390 px has no horizontal overflow. |
| **AB. Freelance, and a shared design layer** | Freelancer.com is the sixth no-key source (`server/connectors/freelance.ts`): `GET /api/projects/0.1/projects/active/` with `job_details` and `full_description`, 20 projects in 371 ms, each marked `Remote · worldwide` with a budget instead of a salary. Upwork and Guru RSS return 403; Fiverr, PeoplePerHour, Truelancer, Twine and Contra are HTML only, and Fiverr is a gig marketplace rather than a job board. The interface moved onto one shared layer, `ui/design.css` + `ui/design.js` (`window.CO.ui`: `toast`, `reveal`, `count`, `ring`, `menu`, `esc`, `ago`, `reduce`), so every page shares tokens, buttons, chips, cards, toasts, skeletons, score rings and one motion vocabulary. Onboarding was rebuilt with a step rail, a Back that is always visible, a "Change resume" path from the prepare page, and a gate on every step that explains what is missing instead of leaving a dead button. The workspace was rebuilt around a split list/detail with a 40 px score ring per row, a 76 px ring in the detail, animated breakdown bars, and a `title-only score` flag when the source sent no description. Verified: every gate blocks and explains, 0 px overflow at 390 px on all five pages, `pnpm typecheck` exits 0. |
| **AC. Extraction reads the page, not the text dump** | A real two-page designed resume reported `MANAGED GAIN USERS` as the full name, no title and no company. The cause was flattening the PDF to plain text: the name shares a line with a tagline, and the stat grid below it interleaves into sentences. `readPdf` now keeps each run's font size and x position, and `segmentsOf` splits a line where the size changes or the gap is wide. The name is the largest type on page one (19 pt, split from a 7 pt tagline). Roles are found in both shapes — one line, or title / company / dates on three — and the title ends at the last title word. `in/<handle>` with no `linkedin.com` is read as a LinkedIn path; a bare domain is a new Website field. Verified on the real file: 10 of 10 fields. Regression-tested on six generated PDFs: single-column, name at body size, two-column sidebar, all-caps name with a credential, a `CURRICULUM VITAE` heading, and the designed header with a stat grid. 0 px overflow at 390 px. |
| **AD. The extraction rule is a command, not a habit** | `pnpm test:extract` (`scripts/test-extraction.mjs`) renders six PDFs, drives the real onboarding page in a real browser and asserts the ten fields. It serves `ui/` from a throwaway static server, blocks the ui-sdk CDN, and needs no API server, no network and no key. The sixth fixture is the exact trap — a 19 pt name sharing a line with a 7 pt tagline, above a stat grid whose last label sits alone on its own line: `MANAGED GAIN USERS`. Reverting `findName` to the old flatten-and-guess logic makes that fixture report `MANAGED GAIN USERS` again, which is how the gate was proven. `CO_RESUME=<path>` adds a real file with generic invariants only (all fields found, the name is a name, the name is not a stat label), so the repository carries no personal data. ADR-019 records why the text layer is the source of truth and why OCR is the fallback for scans, not for text PDFs. |

## Role independence

Onboarding is not a Product Manager flow. Seven families ship with their own
responsibility pool and career paths — Product, Business, Data, Engineering, Design,
Marketing, Security — and anything typed that matches none of them falls back to a
generic pool.

### Occupation search (ADR-012)

The role field is a search, not a fixed list. Three states:

| State | What shows |
|---|---|
| Empty | `Popular career directions` — 12 chips, explicitly a sample |
| Typing, matches found | `Roles matching "X"` with an Exact / Alias / Specialisation / Related badge per row |
| Typing, no match | `No classification yet` + `Use "X"` + a note that paths come from the resume |

Typing `Business Analyst` returns Business Analyst (Exact), IT / Senior / Technical /
Functional Business Analyst (Specialisation), Business Systems Analyst (Related). It
never returns Product Manager or Software Engineer.

The unclassified tag reads `Custom role · AI classification pending` in neutral grey —
not `No taxonomy yet`, which told the user the product did not know their job.

Related matching uses document frequency: the rarest typed word must appear in the
title. Without that, "Data Analyst" matched SOC Analyst and GRC Analyst on the word
*analyst*.

## What the flow adds

- **Resume step** with drag-and-drop, before the profile is confirmed.
- **Verify step** where every field carries a source badge (`HEADER`, `EXPERIENCE`, `DERIVED`) and is editable.
- **Career Path Explorer** — role, relationship, match, missing skills, open jobs in Chennai.
- **Career map completion** — the approved paths become the search titles, each switchable, with the source list and its policy shown before discovery starts.
- **Workspace** — postings with the score, the seven-part breakdown, and `datePosted` kept visibly separate from `firstSeenAt`.
- **Prepare application** — tailoring shown as reorder/rewrite/keep with the CV line that justifies each, the form fields with their source, and the approval gate.

## Honesty notes

- **Extraction is real, in the browser, with no model and no key.** `ui/vendor/pdf.min.js` (pdf.js) and `ui/vendor/mammoth.browser.min.js` read the file locally; `extractProfile` pulls ten fields and keeps the line each one came from. Nothing is uploaded.
- **A PDF is read with its geometry, not as flat text.** Each text run keeps its font size and x position, so a designed resume is read as columns. The name is the largest type on page one, split from the tagline beside it; a stat label like `MANAGED GAIN USERS` is body-sized and can never be mistaken for a person. DOCX has no geometry and falls back to the first-line rules.
- **No OCR is run on a text PDF.** The characters are already in the file, exactly; OCR would re-recognise them from pixels — slower, lossier, and without the type sizes that identify the name. Sarvam Vision is the planned fallback for a scan with no text layer, and is not wired yet (ADR-019).
- Title and company are split when they share a line — `Business Analyst-Meridian Retail Group Nov 2024 - Present` gives title `Business Analyst` and company `Meridian Retail Group`; `Engineer - Data & Business Analysis-Halcyon Systems` gives the full title and `Halcyon Systems`. The title ends at the last title word; the company is what follows. A trailing all-caps tag (`FLAGSHIP VENTURE`, `PLATFORM SCALE`) is dropped.
- Roles are found in two shapes: everything on one line, or title / company / dates on three lines. The current role is the one whose range says `Present`, else the first listed.
- A field the parser cannot find is **empty and marked `not found`**, never filled with a guess. The banner states how many of the ten were found.
- `in/kavya-raman` with no `linkedin.com` is read as a LinkedIn path, because a designed resume prints the wordmark as an icon. A bare `in/` followed by an ordinary word (`in/order`) is not.
- A scanned or image-only PDF yields no text. The step says so and asks for a text-based PDF rather than inventing a profile.
- The resume step is a **state machine**: `empty → reading → ready → removed`. While ready the drop zone is gone and the only control is **Remove**; there is no second upload path.
- The apply screen's candidate details are a **demo persona** (`Ananya Iyer`), labelled as such in the banner. No real person's data ships in the prototype.
- Match percentages in the Career Path Explorer are illustrative. The real numbers come from `@career-ops/career-scoring`.
- The workspace's first posting is the **real** ValGenesis Lever record, verified 2026-11-19 against `api.lever.co/v0/postings/valgenesis`: posted 2026-04-08, first seen 2026-11-19, 7 months stale. The UI says so in red rather than hiding it. The other four are shaped the same way so the list looks like a real feed, including one with no posted date.
- Every other family's postings are **generated samples**, and the workspace says `sample postings` next to the role. Only the Product set contains a real record. A custom role gets postings built from the title you typed — never a Product Manager list.
- The workspace breakdown sums to the score shown. In the app it comes from `scoreJob`, not from a literal.
- The apply screen's tailoring changes are illustrative, but each one cites a line the CV would have to contain. A change with no evidence is not allowed to render.
- **Tailoring is now a real Sarvam call** (`POST /api/tailor`), not illustrative. The drawer shows the keyword coverage it actually counted, the summary it actually wrote, the experience it actually reordered, and the gaps it refused to add. If the key is missing or the model fails, the drawer says so in a sentence; it never shows raw model output. The old four invented "changes" are gone.
- **Apply fills the employer's own form** (`POST /api/fill`) for Lever, Greenhouse, Ashby and SmartRecruiters: a headed Chrome opens the posting, the confirmed profile goes into the visible fields, and the window stays open for the user to read, attach the PDF and submit. Verified against a live Lever form: 12 fields filled. Naukri is not automated (ADR-013); the apply page says so and explains that many Naukri buttons hand off to one of those ATS forms.
- **The workspace never opens on an expired posting.** The list defaults to the last 7 days and the detail pane follows the list: if the selected posting is filtered out, the first visible one is selected instead. Older postings only appear when the user turns the 7-day filter off, and then the detail pane says how old they are.
- **Only the list scrolls.** The page is `100vh` with `overflow: hidden`; the list and the detail pane each scroll inside it. Verified at 1440 px and 390 px: scrolling the list 600 px moves neither the page nor the detail pane.
- **Saved postings have a home.** The bookmark writes to `localStorage` under `co.saved`, the card shows a dot, and the **Saved** filter shows only those, with an empty state that says where they went.
- **Indeed India is live, and its score is honest about what it knows.** The list card carries no description, so a card is flagged `title-only score` and the detail pane offers **Read the full posting**. That reads the posting page in the same Chrome profile and re-scores it with the same `scoreOne` discovery uses. Measured on 2026-11-20: 64.3 title-only → 54.1 with the real 10,153-character description.
- **The browser lives inside the app.** `ui/browser.html` streams the real Chrome through `GET /api/browser/frame` and forwards clicks, scrolls and keystrokes. It is not an `<iframe>` — Naukri and Indeed both send `X-Frame-Options`. The window is real and headed (Cloudflare refuses headless) but parked off-screen, so the user never sees a stray window. Sign in once there; the profile folder is reused by every connector.
- The occupation index is **55 hand-written titles**, not an NCO or ESCO import. It is the right shape and the wrong size. A title outside it gets the custom-role path, which is the designed behaviour, not a failure.
- There is no finance family yet, so `Finance Analyst` falls through to the custom-role path. Adding it is a data change.

## Design language

Taken from Google Career Dreamer: one question per screen, large light heading,
full-width pills, a single primary action bottom-right, optional means optional,
and a visible completion message per step.

Not taken: Google's branding, colours or assets; the US labour-market framing;
the Gemini hand-off.
