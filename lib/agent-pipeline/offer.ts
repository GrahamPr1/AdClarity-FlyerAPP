/**
 * The offer a flyer is selling — price, a short offer line, and an optional
 * deadline — as FACTS, taken verbatim from what the owner typed.
 *
 * Why this exists: generation leaves the offer's wording to the copy model,
 * which writes two short lines under a creative-angle brief. It usually works
 * the price into the headline, but nothing guarantees it, and the deadline
 * ends up in small body text. (An early test that seemed to show the price
 * dropped was wrong: it skipped product parsing, so no price was ever given.)
 * The offer now goes into a dedicated slot filled in code (template-mode.ts),
 * so it is always shown, prominently, and can't be reworded or rounded.
 *
 * Deterministic and pure. A price that isn't explicitly in the text is never
 * produced: no price means no offer slot at all.
 */

export interface OfferFacts {
  /** Verbatim price: "$99", "$1,299", "$89.50", "From $350", "20% off". */
  price: string
  /** Short line naming what the price buys, e.g. "Fall furnace tune-up". Null when none was given. */
  line: string | null
  /** e.g. "Ends Nov 30", "Book by Nov 30". Null when no deadline was given. */
  deadline: string | null
}

// "from"/"starting at" change what the number means, so they stay; "only"/
// "just" are filler and go. Thousands separators only between digit groups,
// so "$99," (a list comma) is $99.
const PRICE_RE = /(?:\b(from|starting at|only|just)\s+)?\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?)(?![\d,]\d)/i
const PERCENT_RE = /\b(\d{1,3})\s?%\s?off\b/i

const MONTHS: Record<string, string> = {
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun",
  jul: "Jul", aug: "Aug", sep: "Sep", sept: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
}
const MONTH_NAME = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?"
const DATE = `(?:${MONTH_NAME}\\s+(\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})/(\\d{1,2}))`
const DEADLINE_RE = new RegExp(
  `\\b(ends?|until|thru|through|expires?|valid (?:through|until)|offer ends|(?:book|schedule|order|call|reserve|sign up|register)\\s+by|by|before)\\s+(?:${DATE})`,
  "i",
)

export function extractPrice(text: string): string | null {
  const m = text.match(PRICE_RE)
  if (m) {
    const amount = `$${m[2]}`
    const qualifier = m[1]?.toLowerCase()
    return qualifier === "from" || qualifier === "starting at" ? `${qualifier[0].toUpperCase()}${qualifier.slice(1)} ${amount}` : amount
  }
  const p = text.match(PERCENT_RE)
  return p ? `${p[1]}% off` : null
}

export function extractDeadline(text: string): string | null {
  const m = text.match(DEADLINE_RE)
  if (!m) return null
  const verb = m[1].toLowerCase()
  let date: string
  if (m[2]) {
    const key = m[2].toLowerCase().replace(/\.$/, "")
    date = `${MONTHS[key.slice(0, key.startsWith("sept") ? 4 : 3)] ?? m[2]} ${Number(m[3])}`
  } else {
    const month = Object.values(MONTHS).filter((v, i, a) => a.indexOf(v) === i)[Number(m[4]) - 1]
    if (!month) return null
    date = `${month} ${Number(m[5])}`
  }
  const action = verb.match(/^(book|schedule|order|call|reserve|sign up|register)\s+by$/)
  return action ? `${action[1][0].toUpperCase()}${action[1].slice(1)} by ${date}` : `Ends ${date}`
}

/** A short offer line, or null — never longer than `max`, cut on a word. */
function shortLine(text: string | null | undefined, max = 48): string | null {
  const t = (text ?? "")
    .replace(PRICE_RE, "")
    .replace(DEADLINE_RE, "")
    .replace(/\s*[,—–-]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.;:—–-]+|[,.;:—–-]+$/g, "")
    .trim()
  if (!t) return null
  if (t.length <= max) return t[0].toUpperCase() + t.slice(1)
  const cut = t.slice(0, max)
  const word = cut.lastIndexOf(" ")
  const s = (word > max * 0.6 ? cut.slice(0, word) : cut).replace(/[,.;:—–-]+$/, "")
  return s[0].toUpperCase() + s.slice(1)
}

/** The badge as one line of text: "$99 · Fall furnace tune-up · Book by Nov 30". */
export function offerBadgeText(offer: OfferFacts): string {
  return [offer.price, offer.line, offer.deadline].filter(Boolean).join(" · ")
}

/**
 * The badge instruction for an AI-written document (the proposal, which has
 * no template). Same facts, same markup hooks as the template badge, except
 * the fields are data-offer-field rather than data-field: an AI document is
 * not field-editable, and data-field is what marks a document as one.
 */
export function offerBadgeNote(offer: OfferFacts): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return (
    "OFFER BADGE — required, exactly once, near the headline, and the most prominent element after it: a solid high-contrast " +
    "block in the brand's accent colour, the price set larger than any text but the headline, the price and deadline never " +
    "wrapping. Use this markup and these values verbatim (style it, don't reword it), and don't repeat the price or deadline elsewhere: " +
    `<div class="offer" data-offer-slot><span class="offer-price" data-offer-field="price">${esc(offer.price)}</span>` +
    (offer.line ? ` <span class="offer-line" data-offer-field="offer">${esc(offer.line)}</span>` : "") +
    (offer.deadline ? ` <span class="offer-deadline" data-offer-field="deadline">${esc(offer.deadline)}</span>` : "") +
    `</div>` +
    // Measured: the proposal's Investment section said "set out in the offer
    // above" instead of the price. A reader skimming to that section must
    // see the terms there too.
    ` ALSO: if the document has a price, investment or cost section, state the terms there in one plain sentence, e.g. ` +
    `"${plainTerms(offer)}" Don't refer the reader elsewhere for the price.`
  )
}

/** The offer in a plain sentence: "Fall furnace tune-up: $99. Book by Nov 30." */
export function plainTerms(offer: OfferFacts): string {
  return `${offer.line ? `${offer.line}: ` : ""}${offer.price}.${offer.deadline ? ` ${offer.deadline}.` : ""}`
}

/**
 * Makes the badge in an AI-written document prominent whatever the agent's
 * own styling did. Measured: given offerBadgeNote, the proposal agent kept
 * the facts verbatim but set them as a small strip, the price no bigger than
 * body text. Sizes are relative to the document's own type (em), so this
 * works at the proposal's small scale; !important because the agent's CSS
 * comes first and may be more specific. A document without the badge is
 * returned unchanged.
 */
export function enforceOfferBadgeStyle(html: string): string {
  if (!/data-offer-slot/.test(html) || html.includes("data-oneflyer-offer-style")) return html
  const css =
    `<style data-oneflyer-offer-style>` +
    `[data-offer-slot]{display:inline-flex!important;flex-wrap:wrap!important;align-items:center!important;column-gap:.6em!important;row-gap:.15em!important;` +
    `padding:.5em .9em!important;border-radius:.4em!important;font-size:1.15em!important;max-width:100%!important}` +
    `[data-offer-slot] [data-offer-field="price"]{font-size:2.4em!important;font-weight:800!important;line-height:1!important;white-space:nowrap!important}` +
    `[data-offer-slot] [data-offer-field="offer"]{font-weight:700!important}` +
    `[data-offer-slot] [data-offer-field="deadline"]{white-space:nowrap!important;text-transform:uppercase!important;letter-spacing:.06em!important;font-size:.85em!important;font-weight:700!important}` +
    `</style>`
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${css}</head>`) : css + html
}

const STOP = new Set(["a", "an", "the", "and", "or", "of", "for", "to", "your", "our", "with", "in", "on", "at", "by", "is", "it", "this", "that", "all"])
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9$%\s]/g, " ").split(/\s+/).filter(Boolean)

/**
 * What's wrong with the copy pass's two lines, if anything — checked in code
 * because the prompt alone didn't hold (measured: "21-Point Safety Check" as
 * the headline above a badge saying the same thing).
 *  - the headline repeats the badge: its price, deadline, or offer line
 *  - a phrase of three or more words appears in both lines
 * Returns a sentence the model can act on, or null.
 */
export function copyProblems(headline: string, supporting: string, offer: OfferFacts | null): string | null {
  const problems: string[] = []
  const h = tokens(headline).join(" ")
  if (offer) {
    if (extractPrice(headline) || h.includes(tokens(offer.price).join(" "))) problems.push("the headline repeats the badge's price")
    if (offer.deadline && extractDeadline(headline)) problems.push("the headline repeats the badge's deadline")
    const line = tokens(offer.line ?? "").filter((t) => !STOP.has(t))
    if (line.length >= 2 && line.every((t) => h.includes(t))) problems.push(`the headline restates the badge's offer line ("${offer.line}")`)
    if (extractPrice(supporting)) problems.push("the supporting line repeats the badge's price")
  }
  const ht = tokens(headline)
  const st = ` ${tokens(supporting).join(" ")} `
  for (let i = 0; i + 3 <= ht.length; i++) {
    const gram = ht.slice(i, i + 3)
    if (gram.filter((t) => !STOP.has(t)).length < 2) continue
    if (st.includes(` ${gram.join(" ")} `)) {
      problems.push(`the headline and supporting line both say "${gram.join(" ")}"`)
      break
    }
  }
  return problems.length ? `Rewrite: ${problems.join("; ")}.` : null
}

/** Offer facts from a structured product (campaign flow). */
export function offerFromProduct(product: {
  name: string
  offer: string
  pricing: string
  limitations: string[]
  description?: string
}): OfferFacts | null {
  const price = extractPrice(product.pricing) ?? extractPrice(product.offer)
  if (!price) return null
  const deadline = extractDeadline([product.offer, ...product.limitations, product.pricing, product.description ?? ""].join(" ; "))
  return { price, line: shortLine(product.name) ?? shortLine(product.offer), deadline }
}

/** Offer facts from free text (onboarding notes, quick prompt): the fallback when there's no product. */
export function offerFromText(purpose: string, notes: string | null): OfferFacts | null {
  const all = [purpose, notes ?? ""].join(" ; ")
  const price = extractPrice(all)
  if (!price) return null
  // A product's purpose is "offer — description" (productPurpose); the badge
  // line is the offer part.
  return { price, line: shortLine(purpose.split(/\s+[—–]\s+/)[0]), deadline: extractDeadline(all) }
}
