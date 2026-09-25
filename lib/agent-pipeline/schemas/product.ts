import { z } from "zod"

/**
 * Structures whatever the client typed about a product into a reusable
 * Product Profile.
 *
 * A STANDALONE schema, deliberately not an extension of
 * IntakeAgentOutputSchema. That schema is already hard against two Anthropic
 * Structured Outputs ceilings (16 union-typed parameters, and total compiled
 * grammar size — see schemas/scrape.ts, where a third added field 400s every
 * call). Hanging products off it would have spent a budget that has nothing
 * left, and would have coupled a product to a flyer intake for no reason.
 *
 * Note the near-total absence of `.nullable()`: empty string and empty array
 * carry "the client didn't say" perfectly well here, and keeping unions at
 * zero leaves this schema room to grow later.
 */
export const ProductExtractionSchema = z.object({
  /** Normalised product name. Echo the client's own wording when they gave
   *  one; never rename their service into something more marketable. */
  name: z.string(),
  /** One or two plain sentences on what it actually is. */
  description: z.string(),
  /** The promotion, if the client described one. Empty when they didn't —
   *  a product with no current offer is completely normal. */
  offer: z.string(),
  features: z.array(z.string()),
  benefits: z.array(z.string()),
  /** Verbatim as given: "from $350", "quoted on site", "$99". Never a
   *  number the client did not state. */
  pricing: z.string(),
  targetCustomer: z.string(),
  /** Claims the business is making that copy may repeat. */
  claims: z.array(z.string()),
  /** Conditions that must travel with the offer — "new customers only",
   *  "ends 30 June". These become required disclaimers downstream. */
  limitations: z.array(z.string()),
  /** Actions a flyer could plausibly ask for, grounded in what the client
   *  said and in the contact details the business actually has. */
  ctaOpportunities: z.array(z.string()),
  /** What had to be inferred, reworded or split apart, so the client can
   *  see and correct the structuring rather than it happening silently. */
  normalizationNotes: z.array(z.string()),
})

export type ProductExtraction = z.infer<typeof ProductExtractionSchema>
