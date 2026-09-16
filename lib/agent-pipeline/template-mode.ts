import { TEMPLATES, templateById, type FlyerTemplate } from "./templates"
import { LOGO_PLACEHOLDER, QR_PLACEHOLDER } from "./flyer-html"

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
}

export interface TemplateFillResult {
  html: string
  /** Which slots the model overshot, for pilot measurement. */
  truncated: string[]
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
    `--brand-accent:${input.colors.accent};--font-heading:${input.fonts.heading};--font-body:${input.fonts.body}}`

  let html = input.template.html
  const slots: Record<string, string> = {
    "{{HEADLINE}}": escapeHtml(headline.text),
    "{{SUPPORTING}}": escapeHtml(supporting.text),
    "{{BUSINESS}}": escapeHtml(input.businessName),
    "{{PHONE}}": escapeHtml(input.phone),
    "{{ADDRESS}}": escapeHtml(input.address ?? ""),
    "{{LOGO_BLOCK}}": logoBlock,
    "{{QR_BLOCK}}": qrBlock,
    "{{PHOTO_BLOCK}}": photoBlock,
  }
  for (const [token, value] of Object.entries(slots)) html = html.split(token).join(value)

  html = html.replace("</style>", `</style><style>${vars}</style>`)
  return { html, truncated }
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
