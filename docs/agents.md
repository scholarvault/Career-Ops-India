# Using Career-Ops India from Claude, Codex and Gemini

The app is also an MCP server (`server/mcp.ts`, 22 tools). Any agent that
speaks MCP can search, score, tailor and run the apply queue; the browser,
the queue and your files stay on this machine.

## Inside this repo: nothing to do

| Agent | Reads | Instructions |
|---|---|---|
| Claude Code | `.mcp.json` | `CLAUDE.md` → `AGENTS.md` |
| Codex CLI | `.codex/config.toml` (trusted project) | `AGENTS.md` |
| Gemini CLI | `.gemini/settings.json` | `AGENTS.md` |

Open the agent in the repo folder and approve the `career-ops-india` server
when it asks.

## From any folder, and Claude Desktop

```bash
pnpm connect            # shows what is connected and the exact command for each
pnpm connect --apply    # registers it with every CLI it finds + Claude Desktop
```

It only adds an entry named `career-ops-india`, backs up the Claude Desktop
config first, and never writes a key.

## You do not have to start the app

Tools that need the browser or the apply queue (`start_apply_batch`,
`get_apply_status`, `answer_ask`, ...) start the local app on `:4173` on
their own if it is down. Set `CAREER_OPS_NO_AUTOSTART=1` to turn that off.

## The loop, with as few approvals as the rules allow

1. `upload_resume` - the master resume. Every tailored resume is cut from it.
2. `set_target_role` - role, cities, years, expected CTC (only what you typed).
3. `search_jobs` → `shortlist` - deterministic 100-point scores.
4. `tailor_batch` - one resume per job; anything missing comes back as `gaps`,
   never invented.
5. `start_apply_batch` - fills and submits on the employer's ATS. It stops and
   asks (`get_apply_status` → `answer_ask`) only for:
   - a one-time code (you read it from your phone or inbox),
   - a captcha or password (opens the in-app hand-off panel),
   - a field it cannot answer from your profile.
6. "Submitted" is recorded only with the site's confirmation as evidence.

Approvals you cannot remove: LinkedIn is opened and prefilled, never
submitted (ADR-015); a captcha is always yours (ADR-004); a password never
passes through the app (ADR-003, ADR-027).

## The browser never needs its own window

The app's Chrome runs headless and is streamed into the app (ADR-026). Indeed
and Workday refuse headless, so they run headed but off-screen. If a site
will not cooperate, press **Open as a window** in the hand-off panel, or set
`CAREER_OPS_BROWSER_MODE=window`.
