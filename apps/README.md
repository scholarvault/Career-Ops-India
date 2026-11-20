# apps/

Reserved for the deployable surfaces. Empty on purpose.

- `web/` — the Next.js dashboard that ports the `ui/` prototypes.
- `agent/` — the long-running local agent.

The logic lives in `../packages/`; an app only wires packages together and owns
its own transport (HTTP, CLI, MCP).
