# AI capability registry

Models are configured per capability, never hard-coded. Switching a model is a config change.

Status: **draft.** Model IDs below come from the Sarvam catalogue; the account's provisioned
list still needs confirming with `GET /v2/models` (the response carries an `access` field).

## Provider tiers

See ADR-011. The app must run end to end with **no key at all**.

| Tier | Key | Default? |
|---|---|---|
| Included | Ours (Sarvam), server-side proxy, per-user daily quota | yes |
| BYOK | The user's — Sarvam, OpenAI, Anthropic, Google, OpenRouter, custom OpenAI-compatible base URL | no |
| None | No key. Deterministic path only. | fallback |

## Capabilities

| Capability | Primary | Fallback | Used by | Notes |
|---|---|---|---|---|
| Resume extraction (native) | pdfjs-dist / Mammoth | — | `career-profile` | Deterministic. No model. |
| Resume extraction (scanned) | Sarvam Document AI (Vision 2.1) | — | `career-profile` | Only when the native parser returns no text. |
| OCR | Sarvam Vision 2.1 | — | `career-profile` | Images inside PDFs, photos of CVs. Async job: submit, poll, retrieve. |
| Career intelligence | `sarvam-105b` | — | `career-scoring` | Writes the explanation only. Never the number. |
| Resume tailoring | `sarvam-105b` | — | `career-profile` | Rewrites and reorders existing facts. |
| Semantic matching | `embeddinggemma-2` | — | `career-scoring` | Optional. Needs Provisioned Throughput. Deterministic score works without it. |
| Job description parsing | `sarvam-105b` | — | `job-discovery` | Extracts required years, skills, salary when stated. |
| Form field mapping | `sarvam-105b` | — | `application-agent` | Proposes a mapping; the deterministic mapper wins on conflict. |
| Indian-language text | `sarvam-105b` | — | any | Same model; Sarvam handles the Indian languages natively. |

## Model notes

**`sarvam-105b`** — the default for everything that needs a model. Verified against the live
API on 2026-11-19: `POST /v1/chat/completions` accepts `sarvam-105b` and
`sarvam-105b-conversations`, and rejects anything else with
`"model should be one of sarvam-105b, sarvam-105b-conversations"`.

It is a **reasoning** model: the response carries `reasoning_content` before `content`, and the
reasoning tokens count against `max_tokens`. A small budget (700) returns `content: null` with
`finish_reason: "length"`. The app uses 2,000 for an explanation, which produced a two-sentence
answer in 4.3 s with 704 reasoning tokens.

**`deepseek-v4.1-flash-1017`** — listed in earlier drafts of this document. It is **not**
accepted by the Sarvam chat endpoint; a settings file that still names it is migrated to
`sarvam-105b` on load.

**Sarvam Vision 2.1** — this is the model behind Sarvam Document AI. It is **not** a
chat-completion model, so it is never configured as `model: "sarvam-vision"`. It is an
asynchronous Document API job.

**`embeddinggemma-2`** — requires Provisioned Throughput. Optional, never a dependency of the MVP.

## Provisioned models

Some Token Factory models require organisation-level provisioning. The rest are serverless.
`GET /v2/models` returns an `access` field identifying which is which, so the app queries the
connected user's actual availability rather than assuming every model is enabled.

## Config shape

```ts
export type Capability =
  | "resume.extract"
  | "resume.ocr"
  | "career.explain"
  | "resume.tailor"
  | "match.embed"
  | "job.parse"
  | "form.map";

export type ModelBinding = {
  capability: Capability;
  provider: "sarvam" | "openai" | "anthropic" | "google" | "openrouter" | "custom" | "local";
  modelId: string;
  /** Hard ceiling per call, in paise. */
  maxCostPaise?: number;
  /** Seconds. */
  timeoutSec: number;
  fallback?: { provider: ModelBinding["provider"]; modelId: string };
};
```

## Rules

1. **No capability is required for the deterministic path.** Scoring, taxonomy and the application plan all run with zero model calls.
2. **Every model output is validated by Zod** before it reaches a package.
3. **Every extracted fact carries a source span.** A value without a span is discarded, not shown.
4. **A model never produces a score, a salary figure, or a demographic answer.**
5. **A failed call degrades, it does not block.** Missing explanation → score without explanation. Missing tailoring → original CV.
6. **The included key never reaches the browser.** Server-side proxy only. No `localStorage`.
7. **AI keys and portal logins are separate connections.** Different forms, different storage.

## To fill in

- [ ] Sarvam account: run `GET /v2/models` and record which models are provisioned.
- [ ] Measured cost per call for each capability, not the list price.
- [ ] Confirm whether `embeddinggemma-2` is provisioned on our org.
- [ ] Rate limits on the included tier, and the daily quota we set per user.
