---
name: career-ops-apply
description: Run the Career-Ops India apply flow from any agent. Upload the master resume, set the target role, read the market funnel, shortlist 10 jobs, tailor one resume per job, then apply with the user answering email/OTP/unknown fields in the chat. Use when the user asks to find Indian jobs, tailor a resume for a posting, or apply to jobs in India.
---

# Career-Ops India — apply

This skill drives the Career-Ops India app through its MCP tools. The app owns
the browser and the apply queue; you own the conversation. The user never has
to open a browser tab to type an email, an OTP or an unknown field: you ask in
the chat and pass the answer back.

## Before you start

The app must be running:

```
node scripts/serve.mjs
```

The MCP server is registered as:

```json
{
  "mcpServers": {
    "career-ops-india": {
      "command": "node",
      "args": ["--import", "tsx", "server/mcp.ts"],
      "cwd": "<this repo>"
    }
  }
}
```

Tools that touch the queue need the app at `http://127.0.0.1:4173` (override
with `CAREER_OPS_URL`). Tools that only read feeds or files work without it.

## The flow

1. **Resume.** If the user has not uploaded one, ask for the file, read it
   locally, and call `upload_resume` with the plain text. Never invent content.
2. **Role.** Ask what role they want. Call `set_target_role` with the role,
   the years of experience you read from the resume, and the contact details
   forms ask for (name, email, phone, city, LinkedIn).
3. **Market.** Call `market_summary` with the role and, if the user named one,
   a state, a city, or `remote: true`. Show the funnel: India, remote, state,
   city, posted in 7 days. Then show the role families and their counts.
4. **Pick.** Call `shortlist` with `limit: 10`. Recommend 10, not all. Say
   plainly that every application spends model tokens and their attention.
   Only go wider if the user insists.
5. **Tailor.** Call `tailor_batch` with the chosen jobs. Report which ones are
   ready. If it fails with `no-key`, send them to Settings → Connections.
6. **Apply.** Call `start_apply_batch` with the tailored jobs and
   `mode: "submit"`. Then poll `get_apply_status`.
7. **Answer.** When `get_apply_status` returns an `ask`, put it to the user in
   the chat in one short question:
   - `otp` — "Indeed sent a code to <email>. Paste it here."
   - `field` — "The form asks for <label>. What should I put?"
   - `captcha` — "There is a bot check on <site>. Open the browser, clear it,
     then tell me to continue." Then call `answer_ask` with `value: "done"`.
   - `login` — "Sign in on <site> in the browser, then tell me to continue."
     Then `answer_ask` with `value: "done"`.
   Call `answer_ask` with the `ask.id` and the value. Never guess a value.
8. **Report.** When the run finishes, summarise: submitted with confirmation,
   parked, failed. Read `list_sites` if the user asks what the agent learned.

## Rules

- **Never guess a required field.** Ask. The answer is saved and reused.
- **Never solve a captcha.** Hand it over, wait, continue.
- **Never ask for a password.** The user signs in themselves in the browser.
- **Never store an OTP.** It is used once and dropped.
- **Cap the batch at 10 a day** unless the user explicitly raises it.
- **A submission counts only with a confirmation** on the page. Do not mark a
  job applied because a button was pressed.
- **LinkedIn is prefill only.** It is never submitted for the user.
- **Do not apply to a job with no tailored resume.** Tailor it first, or leave
  it out and say so.

## What the tools return

- `market_summary` — `counts` (india, remote, state, city, posted7d),
  `families` (core, progression, adjacent, specialisation), `trending`,
  `shortlist`.
- `shortlist` — each job has `id`, `title`, `company`, `location`, `score`,
  `family`, `relationship`, and `miss` (the gaps).
- `get_apply_status` — `running`, `current`, `ask`, and `items` with `status`
  (`queued`, `filling`, `filled`, `needs`, `submitted`, `failed`, `skipped`),
  `confirmation` and `message`.
- `list_sites` — `host`, `flow`, `fields`, `answers`, `successCount`.

## When something is wrong

- `The Career-Ops app is not running` — start it with `node scripts/serve.mjs`.
- `no-key` — the user has not added an AI key. Settings → Connections.
- `no-resume` — call `upload_resume` first.
- `not-a-form` — the posting is closed or needs a sign-in. Skip it and say so.
- A job parked with `needs: "captcha"` — the user must clear it. Do not retry
  in a loop.
