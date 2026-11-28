# Launch video — script v1

**Logline:** A job search in India is a second job. Career Ops India is the workspace that does the repetitive part, on your own machine, for free.

**Format:** 1920×1080, 25 fps, ~100 seconds. English VO (Indian English). Optional 30 s cut and 9:16 cut.
**Tone:** calm, dry, specific. No hype words, no "revolutionary", no stock footage of people shaking hands.
**Colour:** the site's orange `#f36b2b`, off-white `#fbfaf8`, near-black `#111412`. Type: Manrope.

---

## Script

| # | Time | Picture | Voice over | On screen |
|---|------|---------|-----------|-----------|
| 1 | 0:00–0:06 | Black. Text types on, one line at a time. Faint keyboard clicks. | It's 8:42 on a Tuesday night. Three job tabs. Two logins. One expired session. | `8:42 PM` / `three tabs` / `two logins` / `one expired session` |
| 2 | 0:06–0:14 | The landing page's "reality" section, recorded live: resume files drift, CTC and notice period cards float. Fast cuts on each beat. | The same resume, uploaded again. The same salary number, typed again. The same form, on a different portal. | `resume_final.pdf` · `resume_final_2.pdf` · `Expected CTC ₹12,00,000` · `Notice period 30 days` |
| 3 | 0:14–0:21 | Landing hero. Slow push-in on the headline while the ASCII field animates. | This is Career Ops India. A job-search workspace that runs on your machine. | `career ops india` / **Better tools for the job search. Not another paywall.** |
| 4 | 0:21–0:35 | Local app, workspace view: the job list. Cursor moves down the list, one row expands to show the score breakdown. | It searches Naukri, Indeed, twenty-seven company job boards and career pages, and puts every role in one list. Each one scored out of a hundred against your resume, with the reason written next to it. | `82 / 100` · `role fit` · `skills` · `location` |
| 5 | 0:35–0:46 | Console, Tailor step: pick a job, the tailored resume is generated, the keyword-gap panel fills in. | Pick a role and it writes a resume for that job, keeping every date and title. It also shows the keywords you are missing, before you apply. | `Tailored for this role` / `6 keywords missing` / small note: *tailoring uses your own AI key* |
| 6 | 0:46–1:00 | Console, Apply step: the queue runs, a form fills, then an ask card slides in — "Notice period?" — the answer is typed, the card resolves, the queue continues. | Then apply. It fills the form from answers you control, with a daily cap and a duplicate check. When it needs something only you know, an OTP, a notice period, it stops and asks. You answer, and it carries on. | `Waiting on you` / `OTP` / `Notice period` / `Never solves a captcha` |
| 7 | 1:00–1:12 | The "Use your agent" section, recorded: the prompt card, the Copy button pressed, the copied state. Then a terminal typing `git clone` and `pnpm start`. | Three ways to start. Clone it and run it yourself. Or paste one prompt into Claude, Codex or Cursor, and your agent sets it up and walks you through your first search. | `1 clone` · `2 paste one prompt` · `3 connect MCP` |
| 8 | 1:12–1:24 | Motion graphic: a chat window. The agent calls `search_jobs` → 42 results, `score_job` → 82, `fill_form` → "waiting on you". The user types one line. | Or connect the skill and the MCP server, so your agent can search, score and fill from its own chat. It doesn't know this tool yet. The skill teaches it the order. | `skill + MCP` / tool names as small mono labels |
| 9 | 1:24–1:32 | Split screen: a laptop with the workspace, a phone showing the docs page. | Setup needs a computer. The workspace runs locally, so your phone can read the docs, but the app lives on your machine. | `computer for setup` / `phone for reading` |
| 10 | 1:32–1:40 | Open-source section: the branch map draws itself, then the licence line. | No subscription. No per-application fee. AGPL-3.0. Every line that touches your resume is yours to read. | `Free` · `Open source` · `AGPL-3.0` |
| 11 | 1:40–1:48 | End card on off-white. Wordmark, URL, GitHub. | Career Ops India. Free to start. Start today. | `career-ops-india.pages.dev` / `github.com/scholarvault/Career-Ops-India` |

**Word count:** ~250. At 2.5 words/second with pauses, ~100 s of voice, ~108 s of picture.

---

## Audio

- **VO:** Sarvam `bulbul:v2`, `en-IN`. Default speaker `anushka` (female, measured). Alternative `abhilash` (male). Pace 0.95, no exaggerated pitch.
- **Music:** one bed, 90 BPM, soft pulse, no melody competing with speech. Ducked to −18 dB under VO, rises in the gaps at 0:14 and 1:40.
- **SFX:** type-on ticks (scene 1), a low whoosh on each scene change, one soft confirmation tone when the ask card resolves (scene 6). Nothing else.
- **Silence:** 0.4 s of true silence before the end card. It makes the last line land.

---

## 30-second cut

1. 0:00 Hook — "Three job tabs. Two logins. One expired session." (4 s)
2. 0:04 One list, scored. (8 s)
3. 0:12 Tailor + apply, with the ask card. (8 s)
4. 0:20 "Paste one prompt into your agent." (5 s)
5. 0:25 Free, open source, start today. (5 s)

---

## Production

1. **Capture** the live site at 1080p, cursor hidden, one clean scroll per section. Re-record rather than reuse the 52 s desktop capture, which shows a file dialog and the taskbar.
2. **Seed a demo profile** — ~40 sample jobs, one resume, one application in progress — in a separate data folder so the real `data/` is untouched. Every company and number in the demo is labelled sample.
3. **Motion graphics** in Remotion for scenes 1, 8, 9 and 11; the rest is real capture.
4. **Voice** per scene, so each line can be re-timed without re-recording the whole track.
5. **Assemble** with ffmpeg: 1080p25 H.264, AAC 192 kbps, faststart.
6. **Check** on a phone screen at arm's length: is every on-screen line readable at 1×?

---

## Needs

| # | Need | Default if you say "go" |
|---|------|------------------------|
| 1 | Sarvam API key | I ask for it in a secure form when production starts |
| 2 | Voice | `anushka`, en-IN |
| 3 | Language | English only; Hindi dub after, if wanted |
| 4 | Music | Synthesised bed (no licensing risk) |
| 5 | Demo data | Seeded sample profile, real `data/` untouched |
| 6 | Length | 100 s master + 30 s cut |
| 7 | Aspect | 16:9 only; 9:16 on request |
| 8 | Your name | Not shown anywhere |
