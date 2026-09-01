# UI precision review

Baseline and final captures were taken at desktop and iPhone/WebKit sizes before and after this pass. The AcreBrief name, wordmark, cream/green/orange palette, editorial typography, and evidence-first property brief were preserved.

## Baseline triage

### Keep

- AcreBrief logo/wordmark and core identity.
- Editorial, report-like hierarchy rather than a generic SaaS dashboard.
- Restrained palette, square controls, low-radius status treatment, and absence of gradients/glass/glow.
- Property-first brief, transparent score, explicit unavailable facts, operations view, and visible Solari surfaces.

### Improve

- Replace “FRESH LIVE RESULT” for an old source event with clock-accurate language.
- Make event time, source-update time, first-seen time, and retrieval time independently scannable.
- Remove mobile evidence-table horizontal dependence and operations-table ellipsis.
- Give the Investigate button restrained press feedback and gate desktop hover behavior to actual hover-capable pointers.
- Widen timeline timestamps so time-zone labels do not collide with evidence text.

### Remove / reject

- The freshness overclaim.
- Decorative motion, gradients, glows, sparkles, generic AI iconography, fake terminal framing, nested cards, and a new logo.
- A motion library or component-system migration; neither is justified for this narrow pass.

## Before / after / why

| Before | After | Why |
| --- | --- | --- |
| `FRESH LIVE RESULT` | `LIVE VERIFIED RESULT` | Retrieval freshness and event freshness are different facts. |
| Historic lien dominates the queue | Absolute source-dated municipal foreclosure registration with exact DOR parcel | Makes the product question concrete without claiming a court filing or a snapshot diff. |
| Event and observation dates blended in prose | Four-clock timeline: source opened, source updated, first seen, retrieved | Provenance and temporal defensibility become visible in seconds. |
| Evidence ledger required horizontal mobile scrolling | Stacked mobile evidence rows with explicit field labels | Preserves critical provenance without crushing a table into unreadable columns. |
| Mobile operations cells truncated with ellipses | Two-column wrapping source-health rows | Source status and counts remain readable and are not hover-dependent. |
| Button used generic `ease` and ungated hover transform | 150 ms strong ease-out, pointer-gated hover, 1 px active feedback | Purposeful, fast, touch-safe feedback with no decorative motion. |
| Narrow timeline date rail | Wider desktop/mobile time rail | Prevents clock labels from wrapping into the evidence narrative. |
| Queue detail link plus separate live control | Queue primary action starts the real live run and lands directly on truthful source progress | Makes the intended action and Solari activity obvious while preserving the detailed brief below the queue. |
| Confidence could be read as an opportunity guarantee | `High evidence confidence` beside a preliminary score and explicit unavailable facts | Qualifies what is confident: the evidence, not acquisition outcome. |
| Development captures included a framework toolbar | Final captures use the production build | Removes a false “unfinished” signal from review assets. |
| “Latest,” “open,” and “new events” could age as static copy | Absolute source-date, `Open at Sep 1 retrieval`, and `Observed result` | Keeps a durable demo snapshot from implying present-tense freshness later. |

## Motion verdict

**Ship with restraint.** Existing source progress is already truthfully driven by backend SSE completions; no simulated progress or decorative animation was added. The only new motion is direct button feedback. Transform/background are short and use the shared strong ease-out curve. Existing `prefers-reduced-motion` handling remains intact.

## UiSavior regression gate

The exact UiSavior post is a 29-second “30 reasons your site looks vibecoded” video, not an installable skill. It was used as an anti-pattern check rather than a literal design system. The final page has no harsh gradients, rainbow palette, glass, fake testimonials, bento marketing grid, terminal costume, sparkles, radial orbs, dot grid, animated arrows, or empty product-demo claim. Its warnings about all rounded buttons, all hover animation, and specific libraries are treated as stylistic cautions rather than universal usability rules.

Canonical Emil guidance was already installed locally (`emil-design-eng`, `apple-design`, animation audit/review/opportunity skills). No mutable installer or new runtime dependency was added.

## Independent cold review

An adversarial reviewer received the baseline screenshots without product coaching. They correctly identified AcreBrief as a serious evidence-backed property intelligence product, chose the source-dated Aug 31 registration as the primary information, and identified Investigate as the intended action. The material criticisms were the queue action ambiguity, underqualified confidence label, compressed mobile evidence labels, and the development overlay. Each was corrected before the final production-local captures. The reviewer found no justification for a brand, logo, layout-system, or decorative-motion redesign.
