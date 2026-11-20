# Contributing

## Before your first commit

```bash
pnpm install
git config core.hooksPath .githooks   # enables the secret scan on commit
pnpm typecheck
pnpm test:extract
```

## Hard rules

1. **Never commit a key.** Bring your own: put it in `.env` as `SARVAM_API_KEY`, or enter it in Settings, which writes `data/secrets.json`. Both are gitignored. `pnpm check:secrets` runs on every commit and in CI.
2. **Never commit personal data.** No real name, email, phone, handle, resume or screenshot of a real profile in a fixture, demo, comment or doc. Use `example.com` data. The test fixtures are synthetic on purpose.
3. **Never commit `data/`.** It holds the local profile, browser sessions and CVs.
4. **Never collect a platform password, and never bypass a bot check.** See `AGENTS.md`.
5. **Never invent CV facts.** Tailoring reorders and rewrites what the resume already says.

## Pull requests

- `pnpm typecheck` must pass.
- A change to `findName`, `findExperience`, `findLinkedIn` or `findEducation` in `ui/index.html` must keep `pnpm test:extract` green. A new resume shape means a new fixture, not a new guess.
- A new source connector needs a `SourcePolicy` record and an ADR in `docs/decisions.md`.
- UI changes: check 390 px and 1440 px, and say what you measured.

## Licence

Contributions are accepted under AGPL-3.0-or-later.
