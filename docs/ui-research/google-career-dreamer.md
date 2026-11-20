# Google Career Dreamer — UI reference

## Status: not capturable from India

`https://grow.google/career-dreamer/home/profile/experience/2` loads its shell but renders nothing.

Observed 2026-11-19:

| Check | Result |
|---|---|
| Page title | `Career Dreamer \| Grow with Google` — correct |
| `<meta name="user-country">` | `IN` |
| `customElements.get("lit-app")` | defined |
| `lit-app` rendered children | **0** |
| `lit-app` shadow root text | empty |
| reCAPTCHA | `ERROR for site owner: Invalid domain for site key` |
| JS bundle | `assets/index-C1r2U-Hj.js` — HTTP 200, 2.96 MB |
| CSS | `assets/index-Bwub_0Zr.css` — HTTP 200 |
| API calls attempted | none |

The app is a US-only Google Labs experiment. The country check only gates a disclaimer dialog, so the blank render is a separate boot failure — most likely the reCAPTCHA key is not valid for this host.

**No screenshots were fabricated.** The flow below is reconstructed from the public JS bundle's own copy strings, plus the one screenshot the owner supplied.

## Flow, from the bundle

### Step 0 — Disclaimer
> "This tool provides insights based on data from the U.S. Bureau of Labor Statistics and other U.S. sources. If you are based outside of the United States, these insights will not be applicable to you."
> Button: **Continue**

### Step 1 — Title
> "To start, share a current or previous role:"
> Field: `Experience Title` (text input, aria-label)
> Optional: military occupation code — "Have a military occupation code (MOS, AFSC, NEC)? Enter it here (e.g., 'MOS 09L')."

### Step 2 — Organisation
> Placeholder: "Organization or industry (optional)"

### Step 3 — Tasks *(the screen in the supplied screenshot)*
> "Select all the tasks you performed as a(n) **Product Manager** (optional)."
> Chips, multi-select, each a full-width rounded pill.
> Actions: **Re-generate**, **Select all**
> Footer: **Back**, **Next**

### Step 4 — Skills
> "More skills…" for free text. **Re-generate** to refresh suggestions.
> Completion: "🎉 Well done! You've added skills."

### Step 5 — Education
> Fields: `Level` (select), `Subject area`, `Favorite subject`, "Are you a student?"
> Completion: "🎉 Well done! You've added your education."

### Step 6 — Interests
> "Describe a career, industry, or field that interests you."
> Placeholders include: artificial intelligence, agriculture, content creation, creative writing, culinary arts, design, education, e-sports, engineering, entrepreneurship…

### Step 7 — Motivations
> Free text.

### Step 8 — Result
> Career Identity Statement + career possibilities, exportable as a JSON prompt for Gemini.

## Shared UI vocabulary

| Element | Behaviour |
|---|---|
| Progress | Implicit — steps advance in place, no visible stepper |
| Primary action | Blue filled button, bottom right |
| Secondary | White outlined button, bottom right, left of primary |
| Chips | Full-width pills, grey default, **light blue when selected** |
| Type | Large light-weight heading (~56px), grey subheading, 16px body |
| Background | Off-white `#f8f9fa`-ish, no card borders |
| Motion | Step content fades/slides; intro animation gates the first input |

## What we take

1. **One question per screen.** No long form.
2. **Chips for tasks and skills**, not free text — it makes extraction cheap and answers reusable.
3. **Re-generate** on every AI-suggested list. The user is never stuck with a bad suggestion.
4. **Optional means optional** — every step can be skipped.
5. **A visible completion message** per step, so progress is felt.

## What we do not take

- Google's branding, colours or assets.
- The US labour-market framing. Our taxonomy is Indian and role-based.
- The Gemini hand-off. We score and tailor in-house.

## Screenshot

`image.png` (supplied by the owner) — the Tasks screen for Product Manager. Stored at `docs/ui-research/google-career-dreamer/tasks-screen.png`.
