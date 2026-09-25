/**
 * A product, service or offer the business sells.
 *
 * Replaces the free-text "What are you promoting?" string that used to be
 * the only description of the thing being advertised (FlyerRequest.purpose).
 * That string was re-typed for every campaign, could not be reused, and gave
 * the Flyer Agent nothing structured to work from — which is why prices and
 * claims had to be re-stated, and re-checked, every single run.
 *
 * FlyerRequest.purpose is NOT removed: it is still what a retry, a refine and
 * every pre-Phase-3 stored campaign carry. A product simply becomes the
 * richer source that a purpose can be derived FROM.
 *
 * Every factual field is optional and defaults to empty. A product the client
 * has barely described is a real and common state, and an empty field is the
 * honest representation of "they didn't say" — the generator is explicitly
 * forbidden from filling those gaps itself.
 */
export interface ProductProfile {
  id: string
  createdAt: string
  updatedAt: string

  /** What the client called it. The one genuinely required field. */
  name: string
  /** Plain-language description of what it is. */
  description: string | null
  /** The promotion itself — "$99 spring inspection", "20% off first groom". */
  offer: string | null
  /** Concrete, checkable attributes. */
  features: string[]
  /** What the customer gets out of it, as opposed to what it is. */
  benefits: string[]
  /** Free text, because real pricing is "from $350" or "quoted on site". */
  pricing: string | null
  /** Who it is for. Falls back to the business's audience when absent. */
  targetCustomer: string | null
  /**
   * Claims the business wants made. Treated as APPROVED copy the generator
   * may use — which is why they are captured separately from description.
   */
  claims: string[]
  /** Caveats that must travel with the offer: "new customers only", "ends
   *  30 June". Surfaced to the generator as required disclaimers. */
  limitations: string[]
  /** Actions a flyer could ask for, e.g. "Book a free estimate". */
  ctaOpportunities: string[]
  /** Blob URLs of supporting imagery already uploaded through the app. */
  imageUrls: string[]

  /** Exactly what the client typed or uploaded, kept verbatim so a later
   *  re-parse can improve on this one without losing the original. */
  rawInput: string | null
  /** How the AI normalised the raw input — shown to the client so the
   *  structuring is reviewable rather than silent. */
  normalizationNotes: string[]
}

export function emptyProduct(id: string, name: string): ProductProfile {
  const now = new Date().toISOString()
  return {
    id,
    createdAt: now,
    updatedAt: now,
    name,
    description: null,
    offer: null,
    features: [],
    benefits: [],
    pricing: null,
    targetCustomer: null,
    claims: [],
    limitations: [],
    ctaOpportunities: [],
    imageUrls: [],
    rawInput: null,
    normalizationNotes: [],
  }
}

/**
 * The one-line summary used wherever a product needs to be described in a
 * sentence — including as the FlyerRequest.purpose handed to the existing
 * pipeline, which is how a Product reaches the generator without that
 * pipeline needing to learn a new shape.
 */
export function productPurpose(p: ProductProfile): string {
  const parts = [p.offer?.trim() || p.name.trim()]
  if (p.description?.trim() && p.description.trim() !== p.offer?.trim()) {
    parts.push(p.description.trim())
  }
  return parts.join(" — ").slice(0, 300)
}

/** Products a client can hold. A cap that is high enough never to be met in
 *  normal use, and low enough that a scripted loop cannot fill the store. */
export const MAX_PRODUCTS = 50

/** Creative options per generation. The upper bound is a plan/cost decision
 *  as much as a UX one: five variations is five Flyer Agent calls. */
export const MIN_VARIATIONS = 1
export const MAX_VARIATIONS = 5
