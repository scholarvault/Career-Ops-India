# Security

## What this app never collects

- **No platform password.** Naukri, Indeed and every other source are signed into by the user, in a real browser, on their own machine. The app keeps only the browser profile folder, which is gitignored.
- **No resume upload to a server.** A PDF or DOCX is read in the browser. The text is sent to the local server only when the user asks for tailoring.
- **No key in the browser.** An API key is posted once to the local server, written to `data/secrets.json` (gitignored), and never returned by any endpoint.

## Where a key lives

| Tier | Location | Use |
|---|---|---|
| 1 | `SARVAM_API_KEY` in `.env` | deploy, CI |
| 2 | `data/secrets.json`, written by Settings | local use |
| 3 | nowhere | the app runs; AI features ask for a key |

`.env` and `data/` are gitignored. `pnpm check:secrets` fails the build if a key or a real contact detail reaches a tracked file, and the pre-commit hook runs it.

## Reporting a vulnerability

Email the maintainers at the address on the GitHub organisation profile. Do not open a public issue for a live vulnerability. Include the route, the request, and what it exposes.

## If a key is exposed

Deleting the line is not enough - git keeps history. Rotate the key at the provider's dashboard first, then rewrite history if the repository is public.
