# Career Ops India — landing page

A single static page. No build step, no framework, no runtime package manager.
Open `index.html` directly, or serve the folder from any static host.

```
frontend/
  index.html
  assets/
    styles.css
    main.js            nav, reveals, why-scroll, workflow tabs, matrix hooks
    comparison.js      comparison data + matrix interactions
    art.js             hero field, workflow stage, closing panel
    vendor/
      paper-shaders.js @paper-design/shaders 0.0.82 (Apache-2.0)
      textmode.js      textmode.js 0.18.2 (MIT)
```

## Dependencies

Two libraries, both vendored as plain scripts so the page works from `file://`
and from any static host with no bundler at runtime.

| Package | Version | Licence | Size | Used for |
| --- | --- | --- | --- | --- |
| `@paper-design/shaders` | 0.0.82 | Apache-2.0 | 26 KB (esbuild IIFE) | dithered sphere in the hero, dithered wave in the closing panel |
| `textmode.js` | 0.18.2 | MIT | 190 KB (UMD) | real WebGL2 ASCII: hero instrument field, five workflow scenes |

Everything else is hand-written CSS and vanilla JS. Fonts are loaded from Google
Fonts (Manrope, Geist Mono); the page falls back to system sans/mono offline.

## The art engine

`assets/art.js` mounts two kinds of canvas:

- **Paper shader** — a dithered sphere (`u_shape` 7, `u_type` 3) with a
  transparent back, so the ASCII field reads through and around it.
- **textmode field** — a character grid drawn into a `Buffer` and flushed once
  per frame. The buffer is cleared each frame, so a moving element never leaves
  a trail.

The hero field is pointer-reactive: `pointermove` is projected into grid
coordinates and each glyph is pushed away from the pointer with a spring return.
The pointer only disturbs; it never draws. On touch and keyboard-only devices
the field animates on its own.

Reduced motion stops the shader and draws one ASCII frame; the workflow tabs
call `redraw()` so switching a tab still shows the new scene. Without WebGL the
page adds `html.no-webgl`, hides the canvases, and shows a `<pre>` ASCII
fallback.

## Motion

- **Why** — a 210vh sticky stage. Seven source chips start scattered, orbit the
  centre, then drop into one workspace as you scroll. A counter goes `0 / 7` to
  `7 / 7` and the core turns green. Below 980px the same story plays once on its
  own and holds on the finished state.
- **Reality** — the section arrives soft and sharpens as it is read. Each
  timestamp lights as you pass it, and its cards drop into the pile.
- **Workflow** — one large ASCII scene per step, changed only by the tab or the
  arrow keys. It never advances on its own.

## What the page claims

Every number on the page comes from a live run of this repository:

- 1,291 postings from 30 sources in 46 s
- 135 rows from company portals
- Tesla 63, EPAM 251, Amazon 283 India roles
- 100-point scoring across role, skills, experience, industry, location,
  ownership and compensation
- 6 of 9 ATS keywords covered in the example
- a daily cap of 10 applications

The comparison table is dated 21 Nov 2026 and reads each alternative from its
own public pages and repository. Where a product is stronger, the table says so.
Nothing is claimed that the repository does not do: no hosted account, no
subscription, no background scheduler, no auto-submit without review, and no
invented founder story, user count or testimonial.

## Checks run

- 1280×900, 768×1024, 390×844 and reduced-motion: no console or page errors
- no horizontal overflow at any of those widths
- 14 rows × 10 columns in the comparison matrix; jump-to-our-column reaches the end
- 0 italic elements; 0 unrevealed sections after a full scroll
- mobile menu opens, closes on scroll, and traps nothing
- page loads from `file://` with both vendored libraries and no errors
