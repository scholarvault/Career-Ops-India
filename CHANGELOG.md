# Changelog

All notable changes to Career-Ops India are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-28

### Highlights

- **Three places: Find, Queue, Results.** Setup runs once; after that you
  search, queue and see what came back. Your profile lives in Settings.
- **Search that streams.** Every source is asked at once and results appear as
  each answers, the first in a few seconds. Unrelated roles are left out.
- **More of India.** foundit and Wellfound in your own session, Apna's public
  pages, Naukri with your experience, and Firecrawl or TinyFish for career
  sites and the other boards. **Search the web** runs your own search.
- **Master or Tailor, per job.** The queue suggests sending your resume as it
  is when it already covers the posting, and tailoring when it does not.
  Tailoring still never invents.
- **The Career-Ops window.** Sign-ins, OTPs and captchas happen in a real
  browser window that comes forward when you are needed. Paste works.
- **Results with proof.** Only confirmed applications count; jobs already on
  your Naukri applied list are recognised, not skipped.
- **Claude, Codex, Gemini.** One-click connect, and a Claude Desktop plugin.

### Added

- **Applied means applied**: a job Naukri already lists as applied shows as
  "Applied before" (it used to say Skipped) and is recorded once without
  spending today's cap; a job waiting on Naukri's list is rechecked and
  counted once listed; applied jobs leave your queue; Results adds "+N more
  on your Naukri applied list". The app opens on Find.
- **Wellfound, Indeed, Apna, web search** (ADR-036): Wellfound is searched in
  your session (23–30 listings with pay); Indeed's check is shown to you
  during the search and the search carries on once you pass it; Apna jobs
  carry their address, posted date and full description; Search the web
  reports in a bar above the list with "Show only these".
- **Faster, cleaner search** (ADR-035): results stream in as each source
  answers (first postings in under 4 s), unrelated roles at the company boards
  are left out with a count, Apna is searched from its public page, "Search
  Indeed now" re-runs one source after its check, and **Search the web** lets
  you run your own Firecrawl or TinyFish search across career sites, the
  Indian boards, or one board.
- **Live searches what you connected** (ADR-034): foundit is searched in
  your session (48 postings for Product Manager in Chennai), Naukri uses your
  years and two pages (11 → 50), postings naming your locality are marked
  "near you", the Sources panel reports every source from the last search
  (with "Pass a check" for Indeed), and Find has a city filter inside the
  state filter.
- **The Career-Ops window** (ADR-033): sign-in, OTPs, captchas and form review
  happen in the app's own real Chrome window, brought on-screen when you are
  needed and parked after, instead of a blurry screenshot stream. All
  profiles run headed off-screen. foundit sign-in is detected from its
  account pages and greeting. Attaching your own browser is now an advanced
  option.
- **Use my own browser** (ADR-032): attach to your Chrome, Brave or Edge over
  CDP after you turn on remote debugging and click Allow; tick a site and its
  sign-in and auto apply run in a new tab there. Only the app's own tabs are
  touched; Disconnect or 15 idle minutes closes them and detaches.
- **Settings → Profile**: role, years, contact, city, work mode, notice and
  CTC, edited and saved to `data/profile.json`, with the master resume and the
  career map beside them. The bar is Find · Queue · Results; returning users
  never land in setup again.
- **Sign-in popup**: paste works (Ctrl+V into the site's field), a site that
  refuses the hidden browser is retried in a full off-screen one and then a
  window, a new session cookie counts as signed in (Apna), Indeed's session
  cookie is known, and "I signed in" is a fallback. Indian boards run auto
  apply (ADR-031, amended).
- **Queue: master or tailor per job** (ADR-031): each queued job shows Master
  or Tailor, suggested from how many of the posting's terms the master resume
  already shows (85% or more: Master). One button prepares each job its way.
- **Results dashboard**: Applied (confirmed only), This week, Interviews, In
  your queue; the pipeline and heatmap include auto apply's confirmed log;
  "Applied, with proof"; a Sources table (`GET /api/results`).
- **Indian job boards via search** (ADR-031): foundit, Shine, TimesJobs,
  Instahyre, Cutshort, Hirist, iimjobs, Internshala, Apna, Wellfound and
  Freshersworld through Firecrawl and TinyFish, from the index only, each
  shown under its own name.
- **You, from every page**: the bar's avatar opens role, master resume,
  preferences, answers, career map and photo; the photo can come from the
  resume PDF (`GET /api/resume/photo`). The Find toolbar no longer wraps.
- **You · Find · Queue · Results** (ADR-030, later Find · Queue · Results): the bar has four places, with
  Sources behind a gear and one inbox for "Needs you" and news. Find gets a
  Match slider over a score histogram, Posted stops (24 hours to any time,
  undated listed last), a Sources panel built from the results with counts and
  "Connect" rows, and a checkbox per posting with **Add to queue**. The app
  opens on Results after the first confirmed application.
- **Sign in once to more job sites** (`server/lib/jobsites.ts`, Connections):
  Indeed, LinkedIn, foundit, Instahyre, Cutshort, Hirist, iimjobs, Wellfound,
  Internshala, Shine and Apna each get a Connect card. Connect opens the
  site's own sign-in in a popup streamed from the app browser; the app
  notices when you are in (a logout link or a known session cookie, off the
  sign-in path), closes the popup and turns the card green. A bot wall is
  detected and offers "Sign in with a window"; it is never bypassed. Sign out
  clears that site's cookies from the profile. Sites without a connector say
  "Connector next".
- **Claude Desktop extension** (`server/lib/mcpb.ts`, `GET /api/agents/bundle`):
  "Install in Claude" builds `data/career-ops-india.mcpb` (a launcher, the
  manifest and an icon; no key, no profile) and opens it in Claude Desktop,
  which shows its own install window. It then sits under Settings →
  Extensions instead of Developer. When both exist, "Remove the old copy"
  drops the earlier config entry (a `.bak` is kept).
- **Career-site search** (`server/connectors/websearch.ts`): Firecrawl and
  TinyFish reach Workday, SuccessFactors, Oracle, Taleo, iCIMS, Eightfold and
  Phenom pages, where most Fortune 500 India roles live. A result is kept only
  when it is a single posting that names a place in India.
- **Connector gallery** in Connections: one Connect button per source opens the
  provider's sign-in and picks the key up from the clipboard on return. The AI
  provider card shows Connected, the model and a Test button.
- **Tailoring guards**: a metric must stay with its own employer
  (`checkBulletProvenance`, `pnpm test:provenance`), and a sentence or bullet
  that names a hard skill the CV does not show is removed, not just flagged.
- **UI kit** (`ui/design.js` CO.ui, styled in `ui/fx.css`): our own builds of
  Hairline UI patterns, rewritten rather than copied. Number roll on scores; a
  status button that morphs through Saving and Saved; a progress bar that
  finishes green; a setup stepper with filling lines and drawn checks; a
  one-time code that shakes on a wrong code and becomes a pill when verified,
  with a resend countdown; isometric empty states that draw themselves; a toast
  stack; a thinking indicator on Tailor all; a setup checklist on Connections;
  and an avatar cropper that keeps the photo on this computer.
- **Apply, in the loop.** The apply queue groups jobs by what needs you
  (Needs you, Running, Failed, Queued, Filled, Submitted). Each status mark is
  also its clock, and rows glide to their new group. A question from the run
  is an approval card: it shows the job, the field and the site, counts down to
  expiry, and folds into one line once answered.
- **Five steps, one list.** (Superseded within this release by Find · Queue · Results.) The bar is Profile, Connect, Jobs, Apply, Track.
  "Add to apply" in Jobs puts a posting on the apply list, and Apply works
  through it (your list, resumes, apply). Tailor no longer shows an empty
  screen of its own, and the Top 10 / Apply all chooser is gone.
- **Connections, simplified.** AI and agents in one list with live MCP status
  and a one-click Connect for Claude Code, Claude Desktop, Codex, Gemini CLI
  and Cursor. Naukri signs in on its card with phone or email and a code.
  The feed table, the free-source list and the paid list are gone.
- **One-click AI sign-in.** "Sign in with OpenRouter" runs OpenRouter's OAuth
  PKCE flow and saves the key it returns; other providers open their key page
  and the copied key is picked up on return. Screens name the provider you
  configured instead of a hard-coded "Sarvam".
- **Real postings only.** Jobs no longer shows the bundled sample set. The
  first visit runs a live search with a visible "Searching live postings"
  state; later visits show the last results for your role and Live refreshes
  them. A failed search says why and offers Try again, instead of samples.
- **Profile menu.** The profile chip in Jobs opens a menu (role, resume,
  preferences, answers) that edits one step of setup instead of restarting it.
- **Connect by paste.** A search connector waits for the key: Ctrl+V anywhere
  on Connections, or a paste into its box, connects it. Reading the clipboard
  on return is only a shortcut, since Brave, Safari and Firefox block it.
  Connecting two in a row no longer wipes the second one.
- **Job-site sign-in in a popup.** Sign in on Indeed or LinkedIn opens the app
  browser in a dialog on Connections instead of a new full-page tab.
- **Connect in place.** A source's Connect button says Connecting while the
  provider's page is open. The key is checked on return; a good key folds the
  button away and shows what it connected, and a bad one says why.
- **Agent wiring**: `.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`
  and `CLAUDE.md`; `pnpm connect` registers the MCP server globally. MCP starts
  the app when it is down and negotiates the client's protocol version.
- **Dark theme by default** with a light switch (ADR-028), a dot-matrix score
  meter, animated empty states, the ui-sdk OTP input on the Naukri page, and
  onboarding motion: intro, stepper rail, direction-aware steps, confetti.

### Changed

- **UI redesign (ADR-029).** The side rails are gone. One top step bar runs
  across the app: Profile, Connect, Jobs, Shortlist, Tailor, Apply, Track.
  Setup has a horizontal stepper. The skin is calm and hairline: system type,
  frosted bars, pill buttons, and orange only on the main action.
  Express Onboarding is retired and redirects to the one setup.
- The browser runs headless by default; Indeed and Workday run off-screen; a
  window is opt-in (ADR-026). Orphaned Chrome is closed on start and stop.
- Naukri sign-in is email or phone plus a one-time code; the password form is
  gone (ADR-027).
- Naukri discovery uses the signed-in API first, at the profile's experience.
- `pnpm typecheck` now covers `server/`.

### Fixed

- The job list jumped back to the top on every click, save or add to apply.
  It now keeps its place unless the filter, sort or search changes.
- Saving two connector keys at once could erase the AI key: each save read and
  rewrote `data/secrets.json`, and a read that met a half-written file came
  back empty. Secrets now change one at a time, are written atomically, and an
  unreadable file stops the write instead of emptying it. Only the connector
  opened last reads the clipboard, and TinyFish no longer accepts a Firecrawl key.
- The setup checklist counts a connected agent (Claude, Codex, Gemini, Cursor)
  as an AI, not only a pasted key.
- Market counts were every posting scanned, not the role; city and state were
  read from job descriptions; Bengaluru's Hosur Road counted as Tamil Nadu.
- Swiggy, Freshworks and ValGenesis reported 0 jobs on the first load.
- Himalayas dates were dropped (Unix seconds) and expired postings were shown.
- Naukri searched as a fresher, and lost its session after a restart.
- MCP `tailor_batch` sent every job out with the original CV.
- The hand-off page never detected an OTP or captcha (a `cleanBody` typo).

## [0.2.1] - 2026-11-23

### Fixed

- `pnpm start` now opens the app in the browser and says the server keeps
  running in the background. It opens the seven-step setup on a first run and
  the workspace when a profile already exists. `NO_OPEN=1` skips it.
- The apply console has a **Connections** button in its top bar, and its footer
  link is renamed from Settings, so the AI key and job sources are reachable
  from every surface.
- The setup prompt in the README and on the landing page opens
  `http://localhost:4173/` instead of jumping straight to the console, so a new
  user gets the profile setup before the apply flow.
- "Sarvam (included)" was misleading: no key ships with the repository. The
  provider is labelled "Sarvam" and the hint says to paste a key. Without one,
  scoring still works; only the explanation and tailoring are skipped.
- `package.json` had a UTF-8 BOM, so `tsx` refused to parse it and `pnpm start`
  logged "started" and then died.

### Changed

- README quick start and CONTRIBUTING point at Connections, not Settings.

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
