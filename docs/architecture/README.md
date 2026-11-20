# Architecture

## Shape

```
Next.js dashboard  ──HTTP──▶  Local agent (Node + Playwright)
        │                              │
        │                              ├─ browser profile (user's own session)
        │                              └─ data/ (local files)
        │
        └──▶ Cloud (optional): public jobs, companies, funding
```

The dashboard never touches a browser. The agent never holds a password.

## Packages

Five independent packages plus one shared contract. Every engine consumes the
same confirmed profile — none re-extracts from the resume.

| Package | Responsibility | Depends on |
|---|---|---|
| `@career-ops/contracts` | Zod schemas and types for every shared structure | — |
| `@career-ops/career-profile` | Resume text → extraction → profile draft | contracts |
| `@career-ops/career-taxonomy` | Indian role graph, adjacency, career paths | contracts |
| `@career-ops/career-scoring` | Deterministic 100-point match | contracts, taxonomy |
| `@career-ops/job-discovery` | ATS feeds, career pages, funded startups | contracts |
| `@career-ops/application-agent` | Form detection → plan → approval gate | contracts |

```
packages/
  contracts/          src/index.ts   — Profile, Job, Score, SourcePolicy, ApplicationPlan
  career-profile/     src/index.ts   — extractFromText, toProfileDraft, openQuestions
  career-taxonomy/    src/index.ts   — ROLES, findRole, relationshipBetween, pathsFor
  career-scoring/     src/index.ts   — scoreJob, parseRequiredYears, parseSalaryLpa
  job-discovery/      src/index.ts   — discoverLever, normaliseLeverPosting, inCity
  application-agent/  src/index.ts   — planApplication, canSubmit
```

## The profile is the contract

```ts
type Profile = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  location: { city: string; state?: string; country: "IN" };
  links: { linkedin?: string; github?: string; portfolio?: string };
  headline?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
  yearsExperience?: number;
  confirmedAt?: string;   // ← the gate
};
```

`confirmedAt` is set only after the user has reviewed every field. Scoring and
application planning refuse an unconfirmed profile.

## Job record

```ts
type Job = {
  id: string;              // "lever:valgenesis:acbc0284-..."
  sourceId: string;        // "lever" | "naukri" | "inc42-startup"
  sourceUrl: string;
  applyUrl?: string;
  company: string;
  title: string;
  location: string;
  country: string;
  workMode?: "remote" | "hybrid" | "office";
  description: string;
  datePosted?: string;     // employer's date, or absent — never invented
  firstSeenAt: string;     // when *we* found it
  lastVerifiedAt?: string;
  status: "open" | "closed" | "unknown";
};
```

`datePosted` and `firstSeenAt` are different facts and are never merged. The
ValGenesis posting was published 2026-04-08 and first seen 2026-11-19.

## Scoring

Deterministic, 100 points, then an AI-written explanation. The model never
produces the number.

| Category | Weight | What it measures |
|---|---:|---|
| Role fit | 25 | Relationship weight × responsibility overlap |
| Skills | 25 | Job skills present in the profile |
| Experience | 15 | Years vs. the stated requirement |
| Industry | 10 | Domain overlap |
| Location | 10 | City or remote |
| Ownership | 10 | "Owned / launched / led" signals in both |
| Compensation | 5 | Stated salary vs. the floor |

Hard filters run first and reject outright: excluded company, wrong city with
no remote, wrong work mode.

## Role taxonomy

A graph, not a synonym list. Relationship is measured from the anchor
(Product Manager).

| Title | Relationship |
|---|---|
| APM, Junior PM | core, entry |
| Product Manager | core |
| Senior PM, Lead PM | progression |
| Group PM, Director, Head of Product | progression, leadership |
| Product Owner | adjacent — delivery and backlog |
| Product Analyst | adjacent — data and insight |
| Product Operations Manager | adjacent — process |
| Growth PM | specialisation |
| AI PM, Technical PM, Platform PM | specialisation |
| Product Strategy Manager | adjacent — strategy |
| Business Analyst, Project Manager | separate — explained, never merged |

`RELATIONSHIP_WEIGHT` scales the role-fit contribution: core 1.0, progression
0.85, specialisation 0.75, adjacent 0.7, separate 0.35.

## Application state machine

```
discovered → scored → shortlisted → resume_prepared → ready_for_review
   → approved → submitting → submitted → confirmed
                          ↘ blocked (human hand-off)
                          ↘ failed
```

`submitted` requires a confirmation page or message. A click alone is
`submitting`.

## Data model

Local SQLite in `data/career-ops.db` for the MVP. PostgreSQL later, for records
safe to sync.

| Table | Holds |
|---|---|
| `profile` | Candidate facts, confirmed by the user |
| `preferences` | Roles, cities, work mode, level, salary |
| `resumes` | Original file, parsed facts, versions |
| `jobs` | Normalised postings |
| `job_sources` | Source registry + policy |
| `scores` | Score + breakdown + explanation |
| `applications` | One row per attempt |
| `application_events` | State changes with evidence |

Never stored: platform passwords, raw cookies, OTPs.
