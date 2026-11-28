---
name: career-ops-apply
description: Run the Career-Ops India apply flow from any agent. Upload the master resume, set the target role and CTC/experience preferences, read the market funnel, shortlist matching jobs, tailor one honest resume per job, then review/apply with the user answering email/OTP/unknown fields in chat. Use when the user asks to find Indian jobs, tailor a resume for a posting, or apply to jobs in India.
---

# Career-Ops India — Agent Apply Flow

This repo (`server/mcp.ts`) exposes an MCP server (`career-ops-india`) backed by the local Node server (`node scripts/serve.mjs` on `:4173`).

## Setup prerequisites

1. Start the local HTTP + Playwright server once if it is not already running:
   ```bash
   node scripts/serve.mjs
   ```
   Or configure `"career-ops-india"` in your client MCP config with `"cwd"` pointing at your local `Career-Ops India` repository path.
2. **AI Key requirement**:
   - **No AI key needed** for PDF/text extraction, company ATS / Naukri / Indeed discovery, deterministic 100-point `scoreJob`, ATS keyword gaps, or regex Playwright form-filling.
   - **BYOK AI key required** (`data/secrets.json` or `SARVAM_API_KEY`) for AI resume tailoring (`tailor_batch` / `POST /api/tailor`) and 2-sentence explanations (`POST /api/explain`). Recommend `sarvam-105b-conversations` for clean JSON tailoring.

## Standard Flow (Scenarios 1 & 2)

When the user supplies their Master Resume (PDF/text) + target preferences (e.g. `"10 data analyst jobs in Pune, 4 years, expected 14 LPA"`):

1. **Upload Master Resume**:
   - Extract full text/layout from the uploaded resume first, then call `upload_resume` with `text` and `fileName`.
2. **Set Target Role & Preferences**:
   - Call `set_target_role` with normalized role (e.g., `"Product Manager"` or `"Product Related Jobs"` — generic filler words like `related` and `jobs` are stripped automatically), `cities`, `years`, and note user's `currentCtc` / `expectedCtc` / `noticePeriod` for form answers (never guess these values).
3. **Discover & Read Market Funnel**:
   - Call `search_jobs` (set `role`, `cities`, `years`, `sources: ["public", "naukri", "indeed"]`).
   - Call `shortlist` (`limit: 10` or `20`). `shortlist` returns each job's `score`, `jd`, `miss` (skills to learn), `source`, `sourceUrl`, and `applyUrl`.
4. **Batch Tailor**:
   - Call `tailor_batch` with up to 10-20 shortlisted `jobIds`. The server renders print-ready A4 HTML (`renderTailoredResumeHtml`) and generates verified PDFs without inventing any employer, skill, date, or metric.
5. **Present the Scenario 1 Results Table BEFORE Submitting**:
   Show every shortlisted/tailored job clearly with these columns:
   - **Status** (`Tailored · Ready for Apply Approval` — never mark `"Submitted"` before confirmation!)
   - **Role & Company** (link `sourceUrl`)
   - **Experience Asked** (from JD / portal, or `"Not stated in JD"`)
   - **Skills I Need to Learn** (from `miss` / tailored `gaps`)
   - **Channel / Portal** (Direct company site ATS `Lever`/`Greenhouse`/`Ashby`/`SmartRecruiters` vs `Naukri` vs `Indeed India` — note platforms like `Apna` are not built yet and `LinkedIn` is prefill-only per ADR-015)
6. **Confirm & Execute Apply Batch**:
   - Ask explicit user confirmation for which jobs to run via `start_apply_batch`, then monitor `get_apply_status`.
   - If the run pauses (`waiting_user` for OTP, password, CAPTCHA, current CTC, or custom motivation question), ask the user in chat (or open `http://localhost:4173/browser.html` ONLY for CAPTCHAs/passwords) — never bypass bot checks or collect platform passwords.
