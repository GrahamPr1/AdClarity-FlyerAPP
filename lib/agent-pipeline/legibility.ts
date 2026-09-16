import * as cheerio from "cheerio"

/**
 * Legibility guardrails applied to a finished flyer, in code.
 *
 * The failure this exists to stop is text disappearing into a photograph —
 * the single worst outcome for a printed piece, because it is unrecoverable
 * once it has been printed and handed out.
 *
 * Enforced here rather than asked of the model, for the same reason the QR
 * code is substituted and the Unsplash credit is injected: a prompt is a
 * request. The model composes a new flyer every call and cannot see what the
 * last one got wrong, so "make sure text is legible" is a hope, not a
 * guarantee.
 *
 * WHAT THIS CAN AND CANNOT DO — worth stating plainly, because the
 * distinction decides the whole design:
 *
 *   - Contrast against a PHOTO is not computable here. The effective
 *     background is whatever pixels sit behind the glyphs, which needs the
 *     image decoded and the layout resolved. Neither is available in this
 *     path.
 *   - That is exactly why the scrim is mandatory rather than advisory.
 *     Once a scrim sits between the photo and the text, the effective
 *     background is a colour WE chose, and contrast becomes exactly
 *     computable. The scrim isn't just a fix; it's the precondition that
 *     makes verification possible at all.
 *   - Geometric overlap ("two elements collide") is likewise not detectable
 *     without a layout engine. cheerio gives a DOM tree, not boxes, and
 *     Playwright is a devDependency that does not exist in the serverless
 *     generation path. Collisions are better prevented by construction than
 *     detected after the fact.
 */

/* ------------------------------- Contrast -------------------------------- */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Accepts #rgb, #rrggbb, and rgb()/rgba(). Returns null for anything else. */
export function parseColor(value: string | undefined | null): Rgb | null {
  if (!value) return null
  const v = value.trim().toLowerCase()

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
  if (hex) {
    const h = hex[1]
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    }
  }

  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }
  }
  return null
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1:1 to 21:1. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Composites a translucent colour over an opaque one. */
export function compositeOver(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  }
}

/** WCAG AA: 4.5:1 for body text, 3:1 for large text (>=24px, or >=18.66px bold). */
export function requiredRatio(fontSizePx: number, bold: boolean): number {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && bold) ? 3 : 4.5
}

/* --------------------------------- Scrim ---------------------------------- */

/**
 * The scrim itself. A bottom-anchored gradient rather than a flat wash: a
 * solid overlay at the opacity needed for legibility would grey out the
 * photograph the client is paying for, whereas a gradient keeps the image
 * readable where there is no text and goes dense where there is.
 *
 * ::before rather than a wrapper element so nothing in the composed layout
 * moves — this cannot reflow a design the model already balanced.
 * z-index keeps it above the background image and below the text, and
 * print-color-adjust matches PRINT_FIDELITY_CSS so it survives a real print
 * instead of being stripped as a background.
 */
export const SCRIM_CLASS = "oneflyer-scrim"

const SCRIM_CSS =
  `.${SCRIM_CLASS}{position:relative}` +
  `.${SCRIM_CLASS}>*{position:relative;z-index:1}` +
  `.${SCRIM_CLASS}::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;` +
  `background:linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.55) 38%,rgba(0,0,0,0) 72%);` +
  `-webkit-print-color-adjust:exact;print-color-adjust:exact}`

/** The colour text actually sits on inside a scrimmed region, for the contrast check. */
const SCRIM_EFFECTIVE_BG: Rgb = compositeOver({ r: 0, g: 0, b: 0 }, 0.55, { r: 128, g: 128, b: 128 })

export interface LegibilityReport {
  scrimsInjected: number
  /** Text that fails WCAG AA where both colours were resolvable. */
  contrastFailures: { text: string; ratio: number; required: number }[]
  /** Elements whose effective background could not be resolved — not a pass. */
  unresolved: number
}

/** Does this element paint a photograph behind its own text? */
function hasBackgroundImage($el: cheerio.Cheerio<never>): boolean {
  const style = ($el.attr("style") ?? "").toLowerCase()
  return /background(-image)?\s*:[^;]*url\(/.test(style)
}

function hasOwnText($el: cheerio.Cheerio<never>): boolean {
  return ($el.text() ?? "").trim().length > 0
}

/**
 * Injects a scrim behind every text block that sits on a photograph, and
 * reports what remains unverifiable.
 *
 * Scope, stated honestly: this catches the dominant composition — text inside
 * a container that paints a background image, which is how the Flyer Agent
 * overwhelmingly places text on photos. Text absolutely positioned over a
 * sibling `<img>` is NOT caught, because deciding whether it overlaps needs
 * geometry. That case is reported via `unresolved` rather than silently
 * counted as safe.
 */
export function applyLegibilityGuardrails(
  html: string,
  opts: { textColor?: string } = {},
): { html: string; report: LegibilityReport } {
  const $ = cheerio.load(html)
  const report: LegibilityReport = { scrimsInjected: 0, contrastFailures: [], unresolved: 0 }

  $("*").each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>
    if (!hasBackgroundImage($el) || !hasOwnText($el)) return
    const existing = ($el.attr("class") ?? "").split(/\s+/).filter(Boolean)
    if (existing.includes(SCRIM_CLASS)) return
    $el.attr("class", [...existing, SCRIM_CLASS].join(" "))
    report.scrimsInjected++
  })

  // Text sitting over a bare <img> sibling — geometry we cannot resolve.
  report.unresolved = $("img").length > 0 ? $("img").length : 0

  // Contrast, only where BOTH colours are genuinely resolvable. A guess here
  // would be worse than an honest "unknown": it would turn an unverified
  // flyer into a green tick.
  $("[style]").each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>
    const style = ($el.attr("style") ?? "").toLowerCase()
    const text = ($el.text() ?? "").trim()
    if (!text) return

    const fg = parseColor(style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/)?.[1] ?? opts.textColor)
    if (!fg) return

    const inScrim = ($el.attr("class") ?? "").includes(SCRIM_CLASS) || $el.parents(`.${SCRIM_CLASS}`).length > 0
    const bg = inScrim
      ? SCRIM_EFFECTIVE_BG
      : parseColor(style.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}|rgba?\([^)]*\))/)?.[1] ?? null)
    if (!bg) return

    const size = Number(style.match(/font-size\s*:\s*([\d.]+)px/)?.[1] ?? 16)
    const bold = /font-weight\s*:\s*(bold|[6-9]00)/.test(style)
    const ratio = contrastRatio(fg, bg)
    const required = requiredRatio(size, bold)
    if (ratio < required) {
      report.contrastFailures.push({ text: text.slice(0, 60), ratio: Number(ratio.toFixed(2)), required })
    }
  })

  if (report.scrimsInjected === 0) return { html, report }

  const out = $.html()
  const style = `<style>${SCRIM_CSS}</style>`
  const idx = out.toLowerCase().lastIndexOf("</head>")
  return {
    html: idx === -1 ? out + style : out.slice(0, idx) + style + out.slice(idx),
    report,
  }
}
