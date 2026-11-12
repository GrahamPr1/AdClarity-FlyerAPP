import { CW_BODY, CW_HEADING, LH, TEMPLATES, templateById, type FlyerTemplate, type SlotBox, type TextBox } from "./templates"
import { LOGO_PLACEHOLDER, QR_PLACEHOLDER } from "./flyer-html"
import { contrastRatio, parseColor, type Rgb } from "./legibility"

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

/* --------------------------------- Fitting --------------------------------- */

/**
 * How many lines `text` wraps to at `size` in a box `width` wide, assuming
 * every glyph (spaces included) is `charWidth` x size wide.
 *
 * charWidth is the measured worst case across supported fonts (see
 * templates/index.ts), so this over-counts for every real font: a size this
 * accepts fits whichever font renders it.
 *
 * A word wider than the box returns Infinity — "Replaceme / nts" is a defect,
 * so no size that forces it is acceptable — unless `allowBreak` (the last
 * resort, when no size at all keeps every word whole), in which case it is
 * counted as the lines it takes (the templates set overflow-wrap:anywhere).
 */
export function estimateLines(text: string, size: number, width: number, charWidth: number, allowBreak = false): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const glyph = charWidth * size
  const perLine = Math.max(1, Math.floor(width / glyph))
  let lines = 1
  let used = 0
  for (const w of words) {
    const need = used === 0 ? w.length : used + 1 + w.length
    if (need <= perLine) {
      used = need
      continue
    }
    if (used > 0) lines++
    if (w.length > perLine && !allowBreak) return Infinity
    // A word longer than a whole line breaks across lines.
    lines += Math.ceil(w.length / perLine) - 1
    used = w.length % perLine || perLine
  }
  return lines
}

export interface SlotFit {
  text: string
  size: number
  truncated: boolean
  /** The most characters this box can take at the chosen size (the editor's limit). */
  capacity: number
}

/** Characters a box holds at a size: whole lines, with a word-wrap allowance. */
function capacityOf(box: { width: number; height: number; lineHeight: number; charWidth: number }, size: number): number {
  const perLine = Math.floor(box.width / (box.charWidth * size))
  const lines = Math.floor(box.height / (size * box.lineHeight) + 1e-6)
  return Math.max(0, Math.floor(perLine * lines * 0.8))
}

/** The largest size at which `text` fits `box`; trimmed word by word if even the smallest won't do. */
export function fitSlot(text: string, box: SlotBox): SlotFit {
  let current = text.replace(/\s+/g, " ").trim()
  let truncated = false
  for (;;) {
    for (const allowBreak of [false, true]) {
      for (const size of box.sizes) {
        if (estimateLines(current, size, box.width, box.charWidth, allowBreak) * size * box.lineHeight <= box.height + 0.5) {
          return { text: current, size, truncated, capacity: Math.max(current.length, capacityOf(box, size)) }
        }
      }
    }
    if (!current) return { text: "", size: box.sizes[box.sizes.length - 1], truncated, capacity: 0 }
    current = applyBudget(current, Math.max(0, current.length - Math.max(1, Math.ceil(current.length * 0.08)))).text
    truncated = true
  }
}

export interface TextFit {
  headline: SlotFit
  supporting: SlotFit
  gapPx: number
}

/**
 * The headline and supporting line, fitted TOGETHER into one box.
 *
 * Fitting each slot against a fixed share of the box is how the old door
 * hanger clipped: a long headline starved the line beneath it. Together, the
 * largest headline that still leaves the supporting line a readable size wins,
 * with the supporting line kept between 30% and 50% of the headline so the
 * hierarchy survives at every length. Short copy therefore gets LARGE type —
 * that, not a stretched gap, is what keeps a two-word offer from leaving a
 * void. If nothing fits even at the smallest sizes, the supporting line and
 * then the headline lose words until it does.
 */
export function fitText(headline: string, supporting: string, box: TextBox): TextFit {
  let h = headline.replace(/\s+/g, " ").trim()
  let s = supporting.replace(/\s+/g, " ").trim()
  let hCut = false
  let sCut = false
  let allowBreak = false
  const lh = (size: number, text: string, cw: number, lineH: number) => (text ? estimateLines(text, size, box.width, cw, allowBreak) * size * lineH : 0)
  const CW_H = CW_HEADING
  const CW_S = CW_BODY
  const attempt = (loose: boolean) => {
    for (const [i, hs] of box.headlineSizes.entries()) {
      const hHeight = lh(hs, h, CW_H, LH.headline)
      if (hHeight > box.height) continue
      // When a long WORD, not the box height, is what caps the headline, the
      // supporting line may grow to 70% of it: otherwise long copy in a narrow
      // column sits small in a mostly empty box. The headline still leads.
      const wordCapped = i > 0 && !allowBreak && estimateLines(h, box.headlineSizes[i - 1], box.width, CW_H) === Infinity
      const maxRatio = wordCapped ? 0.7 : 0.5
      for (const ss of box.supportingSizes) {
        if (ss > hs * maxRatio) continue
        if (!loose && ss < hs * 0.3 && ss !== box.supportingSizes[box.supportingSizes.length - 1]) break
        const gap = s ? Math.round(hs * box.gap) : 0
        if (hHeight + gap + lh(ss, s, CW_S, LH.supporting) <= box.height + 0.5) return { hs, ss, gap }
      }
    }
    return null
  }
  for (;;) {
    allowBreak = false
    let fit = attempt(false) ?? attempt(true)
    if (!fit) {
      allowBreak = true
      fit = attempt(false) ?? attempt(true)
    }
    if (fit) {
      const hBox = { width: box.width, height: box.height - (s ? fit.gap + lh(fit.ss, s, CW_S, LH.supporting) : 0), lineHeight: LH.headline, charWidth: CW_H }
      const sBox = { width: box.width, height: box.height - lh(fit.hs, h, CW_H, LH.headline) - fit.gap, lineHeight: LH.supporting, charWidth: CW_S }
      return {
        headline: { text: h, size: fit.hs, truncated: hCut, capacity: Math.max(h.length, capacityOf(hBox, fit.hs)) },
        supporting: { text: s, size: fit.ss, truncated: sCut, capacity: Math.max(s.length, capacityOf(sBox, fit.ss)) },
        gapPx: fit.gap,
      }
    }
    // Trim the supporting line first; the headline is the offer.
    if (s.length > 20) {
      s = applyBudget(s, Math.floor(s.length * 0.9)).text
      sCut = true
    } else if (h.length > 8) {
      h = applyBudget(h, Math.floor(h.length * 0.9)).text
      hCut = true
    } else if (s) {
      s = ""
      sCut = true
    } else {
      // Nothing left to trim: a box this small is a template bug, not content.
      throw new Error(`template text box ${box.width}x${box.height} cannot hold even "${h}"`)
    }
  }
}

/* --------------------------------- Colour ---------------------------------- */

/**
 * How the template treats the client's brand colours.
 *
 *   "repair"   (public accounts): text set ON the primary colour becomes white
 *              or near-black, whichever passes WCAG AA, and the headline colour
 *              is the primary darkened until it passes on white. A pale brand
 *              colour — a website scan can hand over a yellow — otherwise puts
 *              white text on yellow (1.5:1 measured).
 *   "preserve" (enterprise org accounts): an org's approved colours are not
 *              ours to alter. Text stays as the template always set it, and
 *              any pair that fails is RETURNED as a contrast note for the
 *              generation log instead.
 */
export type ColorPolicy = "repair" | "preserve"

export interface ContrastNote {
  pair: string
  ratio: number
  required: number
  repaired: boolean
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const NEAR_BLACK: Rgb = { r: 17, g: 20, b: 26 }

const toHex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`
const mix = (a: Rgb, b: Rgb, t: number): Rgb => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })

/** The primary, darkened just enough to read at `ratio` on `ground`. */
function darkenUntil(color: Rgb, ground: Rgb, ratio: number): Rgb {
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const c = mix(color, NEAR_BLACK, t)
    if (contrastRatio(c, ground) >= ratio) return c
  }
  return NEAR_BLACK
}

export interface TemplateColors {
  vars: Record<string, string>
  notes: ContrastNote[]
}

/** The colour variables a template is filled with, and what failed contrast. */
export function templateColors(colors: { primary: string; secondary: string; accent: string }, policy: ColorPolicy): TemplateColors {
  const primary = parseColor(colors.primary) ?? { r: 18, g: 49, b: 79 }
  const notes: ContrastNote[] = []

  // Text on the primary (headers, footers, the social medallion): body-size
  // text sits there, so it needs the full 4.5:1.
  const whiteOnPrimary = contrastRatio(WHITE, primary)
  const darkOnPrimary = contrastRatio(NEAR_BLACK, primary)
  let onPrimary = WHITE
  if (whiteOnPrimary < 4.5) {
    const repair = policy === "repair"
    if (repair) onPrimary = darkOnPrimary > whiteOnPrimary ? NEAR_BLACK : WHITE
    notes.push({ pair: `text on primary ${colors.primary}`, ratio: +whiteOnPrimary.toFixed(2), required: 4.5, repaired: repair && contrastRatio(onPrimary, primary) >= 4.5 })
  }

  // The headline (and phone) in brand colour on white.
  const primaryOnWhite = contrastRatio(primary, WHITE)
  let ink = primary
  if (primaryOnWhite < 4.5) {
    const repair = policy === "repair"
    if (repair) ink = darkenUntil(primary, WHITE, 4.5)
    notes.push({ pair: `primary ${colors.primary} as text on white`, ratio: +primaryOnWhite.toFixed(2), required: 4.5, repaired: repair })
  }

  // The secondary band / field: a light tint of the primary. It carries no
  // text, so it needs no contrast — only to read as a deliberate tone.
  const tint = mix(primary, WHITE, 0.86)

  return {
    vars: {
      "--brand-primary": colors.primary,
      "--brand-secondary": colors.secondary,
      "--brand-accent": colors.accent,
      "--on-primary": toHex(onPrimary),
      "--ink": toHex(ink),
      "--tint": toHex(tint),
    },
    notes,
  }
}

/* ---------------------------------- Fill ----------------------------------- */

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
  /** Defaults to "repair". Enterprise org accounts pass "preserve" — see ColorPolicy. */
  colorPolicy?: ColorPolicy
}

export interface TemplateFillResult {
  html: string
  /** Which slots the model overshot, for pilot measurement. */
  truncated: string[]
  /** Contrast pairs that failed, and whether they were repaired. */
  contrast: ContrastNote[]
}

export function fillTemplate(input: TemplateFillInput): TemplateFillResult {
  const truncated: string[] = []
  const template = input.template
  const hasPhoto = Boolean(input.photoUrl)
  const layout = template.layout({ hasLogo: input.hasLogo, hasQr: input.hasQr, hasPhoto })

  // Budget first (what the polish agent was told), then fit (what the box
  // physically holds at the largest size that works).
  const headline = applyBudget(input.headline, template.budgets.headline)
  const supporting = applyBudget(input.supporting, template.budgets.supporting)
  const text = fitText(headline.text, supporting.text, layout.text)
  if (headline.truncated || text.headline.truncated) truncated.push("headline")
  if (supporting.truncated || text.supporting.truncated) truncated.push("supporting")
  const limits = editLimits(layout)
  const business = fitSlot(input.businessName, layout.business)
  const phone = fitSlot(input.phone, layout.phone)
  const address = fitSlot(input.address ?? "", layout.address)
  if (business.truncated) truncated.push("business")
  if (phone.truncated) truncated.push("phone")
  if (address.truncated) truncated.push("address")

  // Whole blocks rather than bare values, so an absent logo/QR leaves no
  // empty box in the layout. The photo slot is never empty: without a photo
  // it carries the template's secondary band (Option A), not a flat block.
  const logoBlock = input.hasLogo ? `<img class="logo" src="${LOGO_PLACEHOLDER}" alt="" />` : ""
  const qrBlock = input.hasQr ? `<img class="qr" src="${QR_PLACEHOLDER}" alt="" />` : ""
  const media = hasPhoto ? template.media.photo.split("{{PHOTO_SRC}}").join(escapeHtml(input.photoUrl!)) : template.media.none

  const colors = templateColors(input.colors, input.colorPolicy ?? "repair")
  const vars: Record<string, string> = {
    ...colors.vars,
    "--font-heading": input.fonts.heading,
    "--font-body": input.fonts.body,
    ...layout.vars,
  }
  const css = `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`
  const fitCss = fitStyle({ headline: text.headline.size, supporting: text.supporting.size, gap: text.gapPx, business: business.size, phone: phone.size, address: address.size })

  /**
   * Wraps an editable value so a later direct edit can find it.
   *
   * data-field is the handle; data-max is how many characters the box holds
   * AT THE SIZE IT WAS FITTED AT, travelling with the element rather than being
   * looked up later. A direct edit changes text, not size, so the limit has to
   * be the fitted one: the template budget alone would let an edit to a
   * short, large headline overflow its box.
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

  // What a later re-fit needs: which template, and which optional blocks
  // shaped its geometry (refitTemplateFlyer).
  const pageAttrs = `data-template="${template.id}" data-layout="${[input.hasLogo && "logo", input.hasQr && "qr", hasPhoto && "photo"].filter(Boolean).join(",")}"`
  let html = template.html.split("{{MEDIA}}").join(media).split("{{PAGE_ATTRS}}").join(pageAttrs)
  const slots: Record<string, string> = {
    "{{HEADLINE}}": editable("headline", text.headline.text, Math.max(text.headline.text.length, Math.min(template.budgets.headline, limits.headline))),
    "{{SUPPORTING}}": editable("supporting", text.supporting.text, Math.max(text.supporting.text.length, Math.min(template.budgets.supporting, limits.supporting))),
    // BUSINESS is deliberately NOT marked: it also fills <title>, where a
    // span would be rendered as literal text in the browser tab.
    "{{BUSINESS}}": escapeHtml(business.text),
    "{{PHONE}}": editable("phone", phone.text, Math.max(phone.text.length, Math.min(40, limits.phone))),
    "{{ADDRESS}}": editable("address", address.text, Math.max(address.text.length, Math.min(120, limits.address))),
    "{{LOGO_BLOCK}}": logoBlock,
    "{{QR_BLOCK}}": qrBlock,
  }
  for (const [token, value] of Object.entries(slots)) html = html.split(token).join(value)

  html = html.replace("</style>", `</style><style>${css}</style>${fitCss}`)
  return { html, truncated, contrast: colors.notes }
}

/* --------------------------------- Re-fit ---------------------------------- */

/** Tolerates cheerio's re-serialisation (an edit goes through it): a bare attribute comes back as ="". */
const FIT_STYLE_RE = /<style data-oneflyer-fit(?:="[^"]*")?>[\s\S]*?<\/style>/

function fitStyle(px: { headline: number; supporting: number; gap: number; business: number; phone: number; address: number }): string {
  return (
    `<style data-oneflyer-fit="1">:root{--h1:${px.headline}px;--sup:${px.supporting}px;--gap:${px.gap}px;` +
    `--biz:${px.business}px;--phone:${px.phone}px;--addr:${px.address}px}</style>`
  )
}

/**
 * The editor's per-field limits: what each box holds at its SMALLEST allowed
 * size. An edit within these can always be re-fitted (refitTemplateFlyer); a
 * longer one is refused before it reaches the page. Sized against the box
 * minus what the other slot needs at ITS smallest size, so the two lines can
 * both grow to their limits together.
 */
function editLimits(layout: ReturnType<FlyerTemplate["layout"]>) {
  const t = layout.text
  const hMin = t.headlineSizes[t.headlineSizes.length - 1]
  const sMin = t.supportingSizes[t.supportingSizes.length - 1]
  const half = (t.height - Math.round(hMin * t.gap)) / 2
  const at = (box: { width: number; height: number; lineHeight: number; charWidth: number }, size: number) => capacityOf(box, size)
  return {
    headline: at({ width: t.width, height: half, lineHeight: LH.headline, charWidth: CW_HEADING }, hMin),
    supporting: at({ width: t.width, height: half, lineHeight: LH.supporting, charWidth: CW_BODY }, sMin),
    phone: at(layout.phone, layout.phone.sizes[layout.phone.sizes.length - 1]),
    address: at(layout.address, layout.address.sizes[layout.address.sizes.length - 1]),
  }
}

export type RefitResult = { ok: true; html: string } | { ok: false; reason: string }

/**
 * Re-chooses every font size of a stored template flyer for the text it now
 * carries — the step a direct or quick edit needs, because it changes text but
 * not size: a short headline fitted at 200px and then lengthened would
 * otherwise be cut off by its box.
 *
 * Never alters the text. If the new text cannot fit even at the smallest
 * sizes, it refuses, and the caller keeps the previous version. Flyers made
 * before re-fitting existed (no data-template) are returned unchanged.
 */
export function refitTemplateFlyer(html: string): RefitResult {
  const page = html.match(/<div class="page" data-template="([^"]+)" data-layout="([^"]*)"/)
  if (!page || !FIT_STYLE_RE.test(html)) return { ok: true, html }
  const template = templateById(page[1])
  if (!template) return { ok: true, html }
  const flags = new Set(page[2].split(",").filter(Boolean))
  const layout = template.layout({ hasLogo: flags.has("logo"), hasQr: flags.has("qr"), hasPhoto: flags.has("photo") })

  const field = (name: string) => {
    const m = html.match(new RegExp(`<span data-field="${name}"[^>]*>([\\s\\S]*?)</span>`))
    return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&") : ""
  }
  const business = (html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/&amp;/g, "&")

  let text: TextFit
  try {
    text = fitText(field("headline"), field("supporting"), layout.text)
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
  const phone = fitSlot(field("phone"), layout.phone)
  const address = fitSlot(field("address"), layout.address)
  const biz = fitSlot(business, layout.business)
  const cut = [text.headline.truncated && "headline", text.supporting.truncated && "supporting", phone.truncated && "phone", address.truncated && "address"].filter(Boolean)
  if (cut.length) return { ok: false, reason: `too long to fit this layout: ${cut.join(", ")}` }

  const css = fitStyle({ headline: text.headline.size, supporting: text.supporting.size, gap: text.gapPx, business: biz.size, phone: phone.size, address: address.size })
  return { ok: true, html: html.replace(FIT_STYLE_RE, css) }
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

/**
 * The most characters `field` can carry in this stored template flyer, given
 * what the OTHER fields currently say — the "shorten to about N" an editor
 * shows when an edit can't be re-fitted. Null for a flyer that isn't a fitted
 * template (no data-template), where the data-max budget is the only limit.
 */
export function fieldFitLimit(html: string, field: string): number | null {
  const page = html.match(/<div class="page" data-template="([^"]+)" data-layout="([^"]*)"/)
  const template = page ? templateById(page[1]) : null
  if (!page || !template) return null
  const flags = new Set(page[2].split(",").filter(Boolean))
  const layout = template.layout({ hasLogo: flags.has("logo"), hasQr: flags.has("qr"), hasPhoto: flags.has("photo") })
  const read = (name: string) => {
    const m = html.match(new RegExp(`<span data-field="${name}"[^>]*>([\\s\\S]*?)</span>`))
    return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&") : ""
  }
  const text = read(field)
  const fits = (candidate: string): boolean => {
    try {
      if (field === "headline") return !fitText(candidate, read("supporting"), layout.text).headline.truncated && !fitText(candidate, read("supporting"), layout.text).supporting.truncated
      if (field === "supporting") return !fitText(read("headline"), candidate, layout.text).supporting.truncated && !fitText(read("headline"), candidate, layout.text).headline.truncated
      if (field === "phone") return !fitSlot(candidate, layout.phone).truncated
      if (field === "address") return !fitSlot(candidate, layout.address).truncated
    } catch {
      return false
    }
    return true
  }
  if (fits(text)) return text.length
  // Longest word-boundary prefix that fits; fitting is monotonic in length.
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(applyBudget(text, mid).text)) lo = mid
    else hi = mid - 1
  }
  return lo
}
