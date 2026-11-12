# Known issue: layout collisions on the AI path

**Status:** open, logged, not fixed (Phase 2 scope decision, 2026-11-12).
**Affects:** flyers written by the Flyer Agent: proposals, retries, AI refinements, and everything when `TEMPLATE_MODE=off`.
**Does not affect:** template flyers (the default for flyer, one-pager, door hanger and social post). Their geometry is fixed and every text slot is fitted in code (`lib/agent-pipeline/template-mode.ts`), verified by `npm run test:templates`.

The Flyer Agent composes every page from scratch, so it can place a decorative element where text already is. None of the checks below *fixes* that. Two of the three cases are now *detected* and logged; one isn't.

| # | Case | Flyer | Detected? | How it shows up |
|---|------|-------|-----------|-----------------|
| 1 | The $89 medallion is drawn over the subhead "Stay warm all season with a trusted check-up" | [`medallion-over-subhead.html`](ai-path-collisions/medallion-over-subhead.html) · [png](ai-path-collisions/medallion-over-subhead.png) | Yes | `[layout] flyer …: "Stay warm all season…" is covered by another element (collision with div.medallion)` |
| 2 | A decorative wave (SVG) runs through the "Call 270-555-0177" button | [`wave-through-cta.html`](ai-path-collisions/wave-through-cta.html) · [png](ai-path-collisions/wave-through-cta.png) | Yes | `[layout] … is covered by another element (collision with svg)` |
| 3 | Grey header curves run behind the business name "Taylor Welch Realty" | [`curves-behind-business-name.html`](ai-path-collisions/curves-behind-business-name.html) · [png](ai-path-collisions/curves-behind-business-name.png) | **No** | Nothing logged: see below |

All three came from `scripts/medallion-forced-test.ts` (the centred-medallion archetype, no photo), using invented businesses.

## What each check can and can't see

- **`measureLayout`** (`lib/pdf/flyer-pdf.ts`) checks only the PDF page count and whether an `overflow:hidden` box has content larger than itself. It sees none of the three cases.
- **The occlusion check** in `lib/agent-pipeline/contrast-repair.ts` samples nine points along every painted line of text and asks the browser what is stacked above the text there. It flags a line when an unrelated element that *paints* (an image or SVG, or anything with a background colour or image) sits on top of it. That catches cases 1 and 2. On public accounts the pipeline logs it as `[layout]` in `finishAiFlyer` (`pipeline.ts`). The contrast audit lists it as *not scorable: covered by another element* rather than as a contrast failure.
- **Case 3 isn't caught:** the curves are painted *beneath* the text. At every sampled point the stack is `div.business-name > svg.header-art`, so nothing covers the letters, and the text still passes contrast. It's a design defect (decoration competing with the name), not a legibility failure. Catching it would need a "busy backdrop" check, for example how many distinct backdrop colours sit under a line. That check was considered and **deferred** (2026-11-12).

## If this is picked up

- **Prevention beats detection here,** as it did for the templates: for example, give decorative layers a fixed band that text regions never enter.
- **Before any fix,** re-run the forced test and `npm run test:contrast -- docs/known-issues/ai-path-collisions/*.html`. A fix should move cases 1 and 2 from *not scorable* to *scored*.
