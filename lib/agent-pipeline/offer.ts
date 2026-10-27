/**
 * The offer a flyer is selling — price, a short offer line, and an optional
 * deadline — as FACTS, taken verbatim from what the owner typed.
 *
 * Why this exists: generation used to leave the offer to the copy model.
 * Template mode asks it for two short lines under a creative-angle brief, and
 * measured on the Miller Heating test product ("$99 … Book by November 30")
 * it wrote a problem-led headline and a phone-number line every time, so the
 * price and the deadline never reached the flyer. The offer now goes into a
 * dedicated slot filled in code (template-mode.ts), so it can't be dropped,
 * reworded, or rounded.
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
    `</div>`
  )
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
