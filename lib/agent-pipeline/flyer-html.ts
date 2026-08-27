import type { FlyerSpecification } from "./schemas/flyer"

// Pure, dependency-free helpers for producing and repairing flyer HTML.
//
// Split out of pipeline.ts purely so they can be unit-tested: importing
// pipeline.ts pulls in lib/store.ts, which calls Redis.fromEnv() at module
// load and therefore needs live credentials. Everything here is
// deterministic and side-effect-free (assertOfferPreserved only logs), which
// is exactly the logic where the production bugs actually lived.

// The Flyer Agent's prompt only constrains print pagination (@page, for the
// eventual PDF render step) — nothing tells the model to keep the page
// scrollable on screen, and a pixel-perfect single-page design commonly
// comes back with its own html/body height/overflow rules that clip
// anything taller than the viewport. Appended last (not prepended) so these
// !important rules win the cascade over whatever the model's own <style>
// block set, regardless of source order.
// Scoped to @media screen. It used to apply everywhere, which meant
// `height:auto !important` on html/body was also in force while PRINTING,
// fighting the fixed page height each format sets — a door hanger has to
// print at 3.5x8.5in, not reflow to whatever the content wants.
const SCROLL_SAFETY_CSS =
  "@media screen{html,body{height:auto !important;min-height:100% !important;overflow-x:auto !important;overflow-y:auto !important;}}"

/**
 * Browsers strip background colours and images when printing unless told not
 * to. Every one of these designs is built ON colour — a banner-hero flyer
 * prints as white paper with floating text without this, which is worse than
 * not offering printing at all.
 *
 * Injected here rather than required from the model for two reasons: a prompt
 * instruction can be silently missed on any given generation, and this way it
 * applies retroactively to every flyer already stored (the view route runs it
 * on read), not only to newly generated ones.
 *
 * `!important` because it has to beat whatever the generated CSS says, and
 * both the standard property and the -webkit- prefix because Safari and older
 * Chrome only understand the prefixed form.
 */
const PRINT_FIDELITY_CSS =
  "*,*::before,*::after{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}"

const INJECTED_CSS = `<style data-oneflyer="print-and-scroll">${PRINT_FIDELITY_CSS}${SCROLL_SAFETY_CSS}</style>`

/**
 * Adds the on-screen scroll safety net and print colour fidelity.
 *
 * Idempotent — the view route and toDataUrl both call it, and a flyer stored
 * before this existed gets it on the way out.
 */
export function ensureScrollable(html: string): string {
  if (html.includes('data-oneflyer="print-and-scroll"')) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${INJECTED_CSS}</head>`)
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${INJECTED_CSS}</body>`)
  return html + INJECTED_CSS
}

/**
 * The QR image is handed to the Flyer Agent as this short token instead of a
 * real data URL, and swapped for the real one here after generation.
 *
 * A 512px QR data URL is ~4,200 characters (~1,200 tokens) of base64, and the
 * agent was being asked to reproduce it VERBATIM inside its HTML — per flyer,
 * in both the prompt and the completion. That was the single largest chunk of
 * generation time (a Pro run spent ~215s on the flyer stage and had been
 * timing out entirely), and it was also a correctness hazard: one wrong
 * base64 character produces a silently broken QR code on a flyer that may
 * already be printed. Emitting a 15-character token instead removes both
 * problems, and substitution in code is exact by construction.
 */
export const QR_PLACEHOLDER = "{{QR_CODE_SRC}}"

export function substituteQr(html: string, qrDataUrl: string | null): string {
  if (!qrDataUrl) return html
  return html.split(QR_PLACEHOLDER).join(qrDataUrl)
}

/**
 * Inverse of substituteQr — collapses any embedded QR image back to the short
 * token before stored HTML is fed to a model again.
 *
 * Refinement sends the flyer's CURRENT html to the Flyer Agent as context. By
 * that point substituteQr has already replaced the token with ~4,200
 * characters of real base64, so without this the refine path re-introduced
 * exactly the problem the token was added to remove: a huge payload in the
 * prompt that the model then had to reproduce byte-for-byte in its output.
 * Matches any png data URL used as an <img> src, which is what the QR is.
 */
export function collapseQrToToken(html: string): string {
  return html.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, QR_PLACEHOLDER)
}

/**
 * The canonical offer for a campaign: the single source every downstream
 * channel derives from.
 *
 * Repurposing runs as its own model call now, which creates a real risk that
 * each channel quietly re-invents the offer ("$500 off" becoming "big
 * savings", or worse, a different number). Pulling the exact fields off the
 * ALREADY-GENERATED flyer — rather than re-deriving them from the original
 * prompt — means the flyer is definitionally the source of truth, and every
 * repurpose call site uses this one function so they can't drift apart.
 * See also the consistency rules in prompts/repurpose.ts, and
 * assertOfferPreserved below, which checks the result.
 */
/**
 * Post-generation check that repurposed copy didn't silently move the offer.
 *
 * The prompt forbids it, but a prompt is a request, not a guarantee — and the
 * failure this guards against is genuinely damaging: a customer who sees
 * "$500 off" on the flyer and "$400 off" in a text has been misled, and the
 * business wears it. So every monetary amount and percentage that appears in
 * the flyer's own offer/headline must still appear in each channel that
 * mentions a figure at all.
 *
 * Deliberately advisory, not fatal: it logs rather than throws. The flyer is
 * already delivered by the time this runs, and discarding otherwise-good
 * copy over a formatting difference ("$500" vs "500 dollars") would be worse
 * than surfacing it. Channels that mention no figure are not flagged — a
 * Nextdoor post that just says "we're running a promotion" is legitimate.
 */
export function assertOfferPreserved(
  flyerId: string,
  offerSource: { headline: string; offer: string | null },
  repurposed: { instagramCaption: string; textBlurb: string; nextdoorPost: string },
): void {
  const figures = `${offerSource.headline} ${offerSource.offer ?? ""}`.match(/\$\s?[\d,]+(?:\.\d{2})?|\b\d{1,3}\s?%/g)
  if (!figures?.length) return

  const normalize = (v: string) => v.replace(/[\s,]/g, "").toLowerCase()
  const wanted = [...new Set(figures.map(normalize))]

  for (const [channel, text] of Object.entries(repurposed)) {
    const mentionsAFigure = /\$\s?[\d,]+|\b\d{1,3}\s?%/.test(text)
    if (!mentionsAFigure) continue
    const body = normalize(text)
    const missing = wanted.filter((f) => !body.includes(f))
    if (missing.length > 0) {
      console.error(
        `[agent-pipeline] OFFER DRIFT on flyer ${flyerId}: ${channel} states a figure but omits ${missing.join(", ")} from the flyer's offer. Flyer copy is authoritative.`,
      )
    }
  }
}

export function canonicalOfferFrom(flyer: FlyerSpecification) {
  return {
    purpose: flyer.purpose,
    headline: flyer.headline,
    subheadline: flyer.subheadline,
    offer: flyer.offer,
    cta: flyer.cta,
    disclaimer: flyer.disclaimer,
    paletteUsed: flyer.paletteUsed,
    fontsUsed: flyer.fontsUsed,
  }
}

export function toDataUrl(html: string): string {
  const base64 = Buffer.from(ensureScrollable(html), "utf-8").toString("base64")
  return `data:text/html;charset=utf-8;base64,${base64}`
}
