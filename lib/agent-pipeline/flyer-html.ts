import * as cheerio from "cheerio"
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
/* ----------------------- Single bottom anchor (collision) ------------------- */

/**
 * Guarantees exactly one bottom-anchored element per page.
 *
 * A print page is a fixed canvas. Two rules both saying `margin-top:auto`
 * inside the same flex column each try to absorb the free space, and when
 * there IS free space they land on top of each other — a real flyer put its
 * call-to-action across the footer and clipped the business name to
 * "Taylor Wel…".
 *
 * Counter-intuitively this is a SHORT-content failure, not a long-content
 * one: long copy leaves no free space for an auto margin to consume, so the
 * collision disappears. Measured across four generations — the short one
 * collided, the two long ones and the no-photo one did not.
 *
 * There is a prompt rule saying the footer is the only bottom-anchored
 * element, and it is not sufficient on its own — the colliding flyer was
 * generated WITH that rule in place. Same lesson as the QR token and the
 * Unsplash credit: a prompt is a request, injection is a guarantee.
 *
 * Keeps the anchor on whichever matching element sits LAST in document order
 * (the footer, by construction — it is the last thing on the page) and
 * neutralises the rest. Purely subtractive: it only ever turns an auto margin
 * into zero, so it cannot introduce a layout the agent didn't compose.
 */
export function enforceSingleBottomAnchor(html: string): { html: string; neutralised: string[] } {
  const $ = cheerio.load(html)
  const neutralised: string[] = []

  // Document order, for deciding which rule is the real footer.
  const order = new Map<unknown, number>()
  $("*").each((i, el) => {
    order.set(el, i)
  })
  const lastIndexFor = (selector: string): number => {
    let last = -1
    try {
      $(selector).each((_, el) => {
        const i = order.get(el)
        if (i !== undefined && i > last) last = i
      })
    } catch {
      return -1 // a selector cheerio can't parse simply doesn't win
    }
    return last
  }

  $("style").each((_, styleEl) => {
    const css = $(styleEl).html() ?? ""
    if (!/margin-top\s*:\s*auto/i.test(css)) return

    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .map((m) => ({ selector: m[1].trim(), body: m[2], full: m[0] }))
      .filter((r) => /margin-top\s*:\s*auto/i.test(r.body))
    if (rules.length < 2) return

    const keep = rules.reduce((best, r) => (lastIndexFor(r.selector) > lastIndexFor(best.selector) ? r : best), rules[0])

    let out = css
    for (const r of rules) {
      if (r === keep) continue
      out = out.replace(r.full, r.full.replace(/margin-top\s*:\s*auto/gi, "margin-top:0"))
      neutralised.push(r.selector)
    }
    $(styleEl).html(out)
  })

  // Inline styles get the same treatment; the footer is a class rule in
  // practice, so an inline auto margin is always the interloper.
  $("[style*='margin-top']").each((_, el) => {
    const style = $(el).attr("style") ?? ""
    if (!/margin-top\s*:\s*auto/i.test(style)) return
    $(el).attr("style", style.replace(/margin-top\s*:\s*auto/gi, "margin-top:0"))
    neutralised.push(`inline:${$(el).attr("class") ?? $(el).prop("tagName")}`)
  })

  return neutralised.length === 0 ? { html, neutralised } : { html: $.html(), neutralised }
}

/**
 * Guarantees the call to action gets its own row, outside any growable track.
 *
 * enforceBoundedContent stops a too-tall content region painting over the
 * footer, but `overflow:hidden` clips whatever didn't fit — and in a real
 * flyer the thing that didn't fit was the CTA. A flyer whose call to action
 * has been silently cropped away is worse than one with a clipped sentence
 * of body copy.
 *
 * So the CTA is lifted OUT of the growable track and re-inserted immediately
 * after it, as a sibling ahead of the footer. It then occupies its own row in
 * the page's column, sized to its content, and renders regardless of how much
 * content precedes it. The growable track keeps its bound; only body copy can
 * be clipped now, which is the right thing to sacrifice.
 *
 * Done in code because a prompt instruction to "put the CTA in its own row"
 * has already failed to hold twice — same lesson as the QR token, the
 * Unsplash credit and the bottom anchor.
 *
 * Conservative by design: it only moves an element it can positively identify
 * as the CTA AND that genuinely sits inside a growable track. Anything
 * ambiguous is left exactly where the agent put it.
 */
const GROWABLE_RE = /(^|;)\s*flex\s*:\s*(1|auto)\b|(^|;)\s*flex-grow\s*:\s*[1-9]/

export function enforceCtaOwnRow(html: string): { html: string; moved: string | null } {
  const $ = cheerio.load(html)

  // Selectors of growable tracks, read from the stylesheet.
  const growable: string[] = []
  $("style").each((_, el) => {
    for (const m of [...($(el).html() ?? "").matchAll(/([^{}]+)\{([^}]*)\}/g)]) {
      if (GROWABLE_RE.test(m[2])) growable.push(m[1].trim())
    }
  })
  if (growable.length === 0) return { html, moved: null }

  // The CTA: a link or button whose class says so, or a tel: link styled as a
  // block. Deliberately narrow — a false positive would relocate real content.
  const cta = $("a[class*='cta'], button[class*='cta'], [class*='cta-btn'], [class*='cta-button']").first()
  if (cta.length === 0) return { html, moved: null }

  let track: cheerio.Cheerio<never> | null = null
  for (const sel of growable) {
    try {
      const match = cta.parents(sel).first()
      if (match.length > 0) { track = match as unknown as cheerio.Cheerio<never>; break }
    } catch {
      // an unparseable selector simply doesn't match
    }
  }
  if (!track || track.length === 0) return { html, moved: null }

  const label = (cta.attr("class") ?? cta.prop("tagName") ?? "cta").toString()
  cta.remove()
  ;(track as unknown as cheerio.Cheerio<never>).after(cta)
  return { html: $.html(), moved: label }
}

/**
 * Stops a growable content region from painting outside its own box.
 *
 * The failure: on a fixed print page the agent composes
 * `.page { display:flex; flex-direction:column }` with a `.content` child set
 * to `flex:1`, and a footer after it. Flex items default to
 * `min-height:auto`, which refuses to shrink below their content — so when
 * the content is TALLER than the track it was given, it keeps painting
 * downward, straight over the footer. Measured on a real flyer: `.content`
 * box height 598px, content painted to 933px, footer at 932px. The CTA
 * landed on the business name.
 *
 * Counter-intuitively this is a SHORT-content failure. Long copy fills the
 * page and leaves nothing to spill.
 *
 * `min-height:0` is the actual fix — it restores the flex item's ability to
 * shrink, which is what `flex:1` was asking for in the first place.
 * `overflow:hidden` is the backstop for the case where the content genuinely
 * cannot fit: clipping the tail of a paragraph is bad, but printing two
 * elements on top of each other is worse and unrecoverable once printed.
 *
 * Targeted at growable tracks only (`flex:1`, `flex-grow:1`, `flex:auto`), so
 * it cannot touch a fixed-size band, a header, or the footer itself.
 */
export function enforceBoundedContent(html: string): { html: string; bounded: string[] } {
  const $ = cheerio.load(html)
  const bounded: string[] = []

  $("style").each((_, styleEl) => {
    const css = $(styleEl).html() ?? ""
    let out = css
    for (const m of [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]) {
      const [full, selector, body] = [m[0], m[1].trim(), m[2]]
      const growable = /(^|;)\s*flex\s*:\s*(1|auto)\b/.test(body) || /(^|;)\s*flex-grow\s*:\s*[1-9]/.test(body)
      if (!growable) continue
      if (/min-height\s*:/.test(body) && /overflow\s*:/.test(body)) continue
      const additions =
        (/min-height\s*:/.test(body) ? "" : "min-height:0;") + (/overflow\s*:/.test(body) ? "" : "overflow:hidden;")
      out = out.replace(full, `${selector}{${body.trim().replace(/;?$/, ";")}${additions}}`)
      bounded.push(selector)
    }
    if (out !== css) $(styleEl).html(out)
  })

  return bounded.length === 0 ? { html, bounded } : { html: $.html(), bounded }
}

/* --------------------------- Unsplash attribution -------------------------- */

/** Matches the whole credit block injected by injectPhotoAttribution. */
const CREDIT_BLOCK_RE = /<div class="oneflyer-photo-credit"[\s\S]*?<\/style>/i

/**
 * Carries an existing photo credit across a refinement.
 *
 * Refinement re-runs the Flyer Agent with the current HTML and an
 * instruction to change one thing and leave the rest alone. In practice the
 * credit block usually survives that — but "usually" is not a licence term.
 * If the previous version carried a credit and the refined one lost it, it
 * is restored verbatim.
 *
 * No download trigger fires here on purpose: Unsplash's guideline is one
 * trigger per USE, and refining a flyer that already counted is the same
 * use, not a new one. Double-reporting would misstate the photographer's
 * download numbers.
 */
export function preservePhotoCredit(previousHtml: string, refinedHtml: string): string {
  if (CREDIT_BLOCK_RE.test(refinedHtml)) return refinedHtml
  const previous = previousHtml.match(CREDIT_BLOCK_RE)?.[0]
  if (!previous) return refinedHtml
  const idx = refinedHtml.toLowerCase().lastIndexOf("</body>")
  return idx === -1 ? refinedHtml + previous : refinedHtml.slice(0, idx) + previous + refinedHtml.slice(idx)
}


/** The subset of an Unsplash photo needed to credit it. */
export interface PhotoCredit {
  url: string
  photographerName: string
  photographerUrl: string
}

/** Escapes text that came from Unsplash before it goes into generated HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Which credits actually belong on this flyer.
 *
 * Matched against the FINAL html rather than the photo pool, because the pool
 * is a set of candidates and the Flyer Agent is explicitly allowed to use
 * none of them (see rule 5 in prompts/flyer.ts — "use a photo ONLY when an
 * entry actually fits"). Crediting a photo the agent declined to use would be
 * a false statement on a client's flyer, and firing Unsplash's download
 * trigger for it would misreport usage.
 */
export function creditsUsedIn<T extends PhotoCredit>(html: string, candidates: T[]): T[] {
  return candidates.filter((c) => c.url && html.includes(c.url))
}

/**
 * Stamps the required Unsplash credit onto a finished flyer.
 *
 * Injected in code for the same reason the QR code is substituted rather than
 * emitted by the model: the Unsplash API Guidelines REQUIRE this credit, and
 * a prompt instruction is a request, not a guarantee. A flyer that quietly
 * lost its attribution is a licence-terms problem on a document that may
 * already be printed.
 *
 * `medium` comes from the format definition (lib/agent-pipeline/formats.ts):
 * screen formats get real links, print formats get plain text, because a
 * hyperlink on a door hanger credits nobody.
 *
 * Positioned fixed at the foot of the page with its own tiny type rather than
 * inserted into the layout, so it cannot disturb a design that was already
 * composed — including the paginated proposal, where a fixed footer is
 * correct on every page. print-color-adjust matches PRINT_FIDELITY_CSS so it
 * survives an actual print.
 */
export function injectPhotoAttribution(html: string, credits: PhotoCredit[], medium: "print" | "screen"): string {
  if (credits.length === 0) return html

  const inner = credits
    .map((c) => {
      const name = escapeHtml(c.photographerName)
      if (medium === "print") return `Photo by ${name} on Unsplash`
      // Both hrefs go through escapeHtml: a bare & is invalid inside an
      // attribute value, and the UTM params the Guidelines ask for contain
      // one. Escaping only the interpolated URL and hand-writing the other
      // is how they drift apart.
      const profile = escapeHtml(`${c.photographerUrl}?utm_source=oneflyer&utm_medium=referral`)
      const home = escapeHtml("https://unsplash.com/?utm_source=oneflyer&utm_medium=referral")
      return (
        `Photo by <a href="${profile}" rel="noopener noreferrer nofollow" target="_blank">${name}</a>` +
        ` on <a href="${home}" rel="noopener noreferrer nofollow" target="_blank">Unsplash</a>`
      )
    })
    .join(" &middot; ")

  const markup =
    `<div class="oneflyer-photo-credit" aria-label="Photo attribution">${inner}</div>` +
    `<style>.oneflyer-photo-credit{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;` +
    `padding:2px 6px;text-align:right;font-family:system-ui,-apple-system,sans-serif;font-size:7px;` +
    `line-height:1.3;letter-spacing:.01em;color:rgba(0,0,0,.55);background:rgba(255,255,255,.72);` +
    `-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `.oneflyer-photo-credit a{color:inherit;text-decoration:underline}</style>`

  // Before </body> when there is one; otherwise appended, since the agent's
  // output is not guaranteed to be a complete document.
  const idx = html.toLowerCase().lastIndexOf("</body>")
  return idx === -1 ? html + markup : html.slice(0, idx) + markup + html.slice(idx)
}

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
