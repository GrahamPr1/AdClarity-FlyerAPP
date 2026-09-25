import type { ProductProfile } from "@/lib/product-profile"

/**
 * Distinct MESSAGING angles for a batch of variations.
 *
 * design-variants.ts already varies the composition — where the eye lands,
 * how the page is divided — and does it well. What it does not vary is what
 * the flyer SAYS. Five flyers for one product previously came back as five
 * layouts of the same headline, because nothing in the pipeline ever asked
 * for a different argument.
 *
 * An angle is a persuasion strategy, not a tone. "Urgency" and "trust" lead
 * with genuinely different facts and ask for the decision in different ways,
 * which is what makes a client able to pick between them rather than just
 * pick a layout.
 *
 * Every angle is still bound by the same rule as everything else here: it
 * selects and emphasises facts the client actually gave. An angle that has
 * no supporting fact is not offered — see anglesFor below, which is why
 * `requires` exists.
 */
export interface CreativeAngle {
  id: string
  name: string
  /** Handed to the Flyer Agent as the creative direction for this variation. */
  brief: string
  /**
   * What the product must actually have for this angle to be honest.
   * Offering "limited-time urgency" for a product with no deadline would
   * force the model to invent one, which is the failure this prevents.
   */
  requires?: (p: ProductProfile) => boolean
}

export const CREATIVE_ANGLES: CreativeAngle[] = [
  {
    id: "offer-led",
    name: "Offer-led",
    brief:
      "Lead with the offer itself as the headline — the number or the deal is the largest thing on the page. Everything else exists to support it. Use this when the price or discount is the most persuasive fact available.",
    requires: (p) => !!(p.offer?.trim() || p.pricing?.trim()),
  },
  {
    id: "problem-solution",
    name: "Problem / solution",
    brief:
      "Open by naming the problem the reader already has, in their words, then present the product as the resolution. The headline is the problem or the question; the offer appears after the reader recognises themselves.",
  },
  {
    id: "outcome-led",
    name: "Outcome-led",
    brief:
      "Lead with the result the customer ends up with rather than the service performed. The headline describes the after-state. Supporting copy connects it back to what is actually being sold.",
    requires: (p) => p.benefits.length > 0 || !!p.description?.trim(),
  },
  {
    id: "trust-led",
    name: "Trust-led",
    brief:
      "Lead with credibility — the business's standing, experience, or the concrete reassurances it offers. The headline establishes why this business, then the offer follows as the reason to act now. Use only claims the client actually supplied.",
    requires: (p) => p.claims.length > 0,
  },
  {
    id: "urgency",
    name: "Time-sensitive",
    brief:
      "Lead with the deadline or the limited availability, which must be one the client actually stated. The headline carries the time pressure; the offer sits immediately beneath it. Never imply scarcity that was not given to you.",
    requires: (p) => p.limitations.some((l) => /\b(ends?|until|expires?|limited|deadline|through|by )\b/i.test(l)),
  },
  {
    id: "straightforward",
    name: "Straightforward",
    brief:
      "No angle beyond clarity: what it is, what it costs, who it's for, how to get it. Plain, unhurried, and complete. The baseline every business should have, and often the best performer for trades.",
  },
]

/**
 * The angles this product can honestly support, in a stable order, capped at
 * `count`.
 *
 * "straightforward" is always available and always last-resort, so a product
 * with almost nothing filled in still yields N distinct variations rather
 * than failing — they simply lean on composition for their difference, which
 * is the honest outcome when there is little to say.
 */
export function anglesFor(product: ProductProfile, count: number): CreativeAngle[] {
  const eligible = CREATIVE_ANGLES.filter((a) => !a.requires || a.requires(product))
  const chosen: CreativeAngle[] = []

  for (const angle of eligible) {
    if (chosen.length >= count) break
    chosen.push(angle)
  }

  // Not enough eligible angles for the batch: repeat the most broadly
  // applicable ones rather than offering a dishonest angle. The layout
  // variation still makes these distinct pieces.
  const fallback = CREATIVE_ANGLES.filter((a) => !a.requires)
  let i = 0
  while (chosen.length < count && fallback.length > 0) {
    chosen.push(fallback[i % fallback.length])
    i++
  }

  return chosen
}
