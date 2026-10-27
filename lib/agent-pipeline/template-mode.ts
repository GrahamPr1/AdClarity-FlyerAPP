import type { OfferFacts } from "./offer"
import { TEMPLATES, templateById, type FlyerTemplate } from "./templates"
import { LOGO_PLACEHOLDER, QR_PLACEHOLDER, keepPhonesTogether } from "./flyer-html"

/**
 * Template mode — code builds the flyer, the model writes only two lines.
 *
 * Replaces the Flyer Agent's from-scratch HTML (~8,070 output tokens, $0.0944
 * measured over 98 real calls) with a pre-built layout whose slots are filled
 * in code. Everything the pipeline already guarantees still applies, because
 * this emits the SAME tokens the existing post-processing expects:
 * LOGO_PLACEHOLDER and QR_PLACEHOLDER go in here and are substituted by the
 * same substituteLogo/substituteQr the AI path uses.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/**
 * Cuts text to a template's physical limit, at a word boundary.
 *
 * The prompt states the budget AND this enforces it, because a model asked for
 * "about 40 characters" routinely returns 60 — and on a fixed template that is
 * an overflowing headline, not a slightly long one. This is the same
 * ask-then-guarantee split used for the QR token and the logo.
 *
 * Returns whether it had to cut, so a pilot can measure how often the model
 * overshoots rather than assuming it doesn't.
 */
export function applyBudget(text: string, max: number): { text: string; truncated: boolean } {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return { text: clean, truncated: false }
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  // Only break on a word if that keeps most of the budget; otherwise a long
  // single word would collapse the line to almost nothing.
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return { text: kept.replace(/[\s,;:–—-]+$/, ""), truncated: true }
}

export interface TemplateFillInput {
  template: FlyerTemplate
  headline: string
  supporting: string
  businessName: string
  phone: string
  address: string | null
  /** Null when the client has no logo — the whole block is omitted, not left blank. */
  hasLogo: boolean
  hasQr: boolean
  photoUrl: string | null
  colors: { primary: string; secondary: string; accent: string }
  fonts: { heading: string; body: string }
  /** The offer badge's facts (lib/agent-pipeline/offer.ts). Null or absent: no badge at all. */
  offer?: OfferFacts | null
}

export interface TemplateFillResult {
  html: string
  /** Which slots the model overshot, for pilot measurement. */
  truncated: string[]
}

/** Field budgets for the badge: what fits its line at the smallest (door hanger) size. */
export const OFFER_BUDGETS = { price: 14, offer: 40, deadline: 22 } as const

/**
 * The offer badge. Price, offer line and deadline are separate editable
 * fields, so a quick edit ("change the price to $89") changes the badge
 * itself rather than rewriting body copy. The line and deadline spans are
 * always present — empty and hidden (:empty) when not given — so an edit can
 * add a deadline later.
 */
function offerBadge(offer: OfferFacts, editable: (field: string, value: string, max: number) => string): string {
  // A price never wraps, so a long one ("From $1,299.50") shrinks to fit the
  // badge instead; "$99" or "$1,299" keep full size. Measured by render: at
  // full size a 14-character price was wider than the split-vertical column.
  const scale = offer.price.length <= 6 ? 1 : Math.max(0.5, 6.5 / offer.price.length)
  return (
    `<div class="offer" data-offer-slot${scale < 1 ? ` style="--price-scale:${scale.toFixed(2)}"` : ""}>` +
    `<span class="offer-price">${editable("price", offer.price, OFFER_BUDGETS.price)}</span>` +
    `<span class="offer-text">` +
    `<span class="offer-line">${editable("offer", offer.line ?? "", OFFER_BUDGETS.offer)}</span>` +
    `<span class="offer-deadline">${editable("deadline", offer.deadline ?? "", OFFER_BUDGETS.deadline)}</span>` +
    `</span></div>`
  )
}

/** #111 or #fff, whichever has the higher WCAG contrast against `hex`. */
export function readableOn(hex: string): string {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return "#fff"
  const full = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  const lin = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
  const vsWhite = 1.05 / (L + 0.05)
  const vsDark = (L + 0.05) / (0.0137 + 0.05) // #111
  return vsDark > vsWhite ? "#111" : "#fff"
}

export function fillTemplate(input: TemplateFillInput): TemplateFillResult {
  const truncated: string[] = []
  const headline = applyBudget(input.headline, input.template.budgets.headline)
  const supporting = applyBudget(input.supporting, input.template.budgets.supporting)
  if (headline.truncated) truncated.push("headline")
  if (supporting.truncated) truncated.push("supporting")

  // Whole blocks rather than bare values, so an absent logo/QR/photo leaves no
  // empty box in the layout.
  const logoBlock = input.hasLogo ? `<img class="logo" src="${LOGO_PLACEHOLDER}" alt="" />` : ""
  const qrBlock = input.hasQr ? `<img class="qr" src="${QR_PLACEHOLDER}" alt="" />` : ""
  const photoBlock = input.photoUrl ? `<img class="photo" src="${escapeHtml(input.photoUrl)}" alt="" />` : ""

  const vars =
    `:root{--brand-primary:${input.colors.primary};--brand-secondary:${input.colors.secondary};` +
    `--brand-accent:${input.colors.accent};--font-heading:${input.fonts.heading};--font-body:${input.fonts.body};` +
    // The badge is a solid block of the brand's accent; its text is black or
    // white, whichever reads better on that accent.
    `--offer-bg:${input.colors.accent};--offer-fg:${readableOn(input.colors.accent)}}`

  /**
   * Wraps an editable value so a later direct edit can find it.
   *
   * data-field is the handle; data-max is the character budget the LAYOUT
   * can physically fit, travelling with the element rather than being looked
   * up later. That matters because the budget is per-template and per-field:
   * carrying it in the markup means the editor enforces the same limit the
   * generator did, on a flyer whose template choice nobody has to re-derive.
   *
   * An inline <span> is used rather than putting the attribute on the
   * surrounding element, so this works for all templates at once without
   * hand-editing each one, and cannot change layout — a span is inline and
   * inherits everything from its parent.
   *
   * Flyers generated before this existed simply have no data-field
   * attributes, which is exactly how the UI detects that direct editing is
   * unavailable and offers AI refine instead.
   */
  const editable = (field: string, value: string, max: number) =>
    `<span data-field="${field}" data-max="${max}">${escapeHtml(value)}</span>`

  let html = input.template.html
  const slots: Record<string, string> = {
    "{{HEADLINE}}": editable("headline", headline.text, input.template.budgets.headline),
    "{{SUPPORTING}}": editable("supporting", supporting.text, input.template.budgets.supporting),
    // BUSINESS is deliberately NOT marked: it also fills <title>, where a
    // span would be rendered as literal text in the browser tab.
    "{{BUSINESS}}": escapeHtml(input.businessName),
    "{{PHONE}}": editable("phone", input.phone, 40),
    "{{ADDRESS}}": editable("address", input.address ?? "", 120),
    "{{LOGO_BLOCK}}": logoBlock,
    "{{QR_BLOCK}}": qrBlock,
    "{{PHOTO_BLOCK}}": photoBlock,
    "{{OFFER_BLOCK}}": input.offer ? offerBadge(input.offer, editable) : "",
  }
  for (const [token, value] of Object.entries(slots)) html = html.split(token).join(value)

  html = html.replace("</style>", `</style><style>${vars}</style>`)
  return { html: keepPhonesTogether(html), truncated }
}

/**
 * Deterministic per-flyer template choice.
 *
 * Seeded on the flyer id like assignDesignVariants, so two pieces in one batch
 * differ and a refinement of the same flyer lands on the same layout.
 */
export function selectTemplate(flyerId: string, formatId: string = "flyer"): FlyerTemplate | null {
  // Filter FIRST. Picking from every template and hoping the format matches
  // would eventually render a 1080x1080 square on a 3.5in door hanger.
  const eligible = TEMPLATES.filter((t) => t.formatIds.includes(formatId))
  if (eligible.length === 0) return null

  let h = 0x811c9dc5
  for (let i = 0; i < flyerId.length; i++) {
    h ^= flyerId.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return eligible[h % eligible.length]
}

export { TEMPLATES, templateById }
