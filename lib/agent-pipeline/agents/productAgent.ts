import { runJsonAgent } from "../client"
import { PRODUCT_AGENT_SYSTEM_PROMPT } from "../prompts/product"
import { ProductExtractionSchema, type ProductExtraction } from "../schemas/product"
import type { BusinessProfile } from "@/lib/business-profile"

/**
 * Turns a client's free text about a product into a structured Product
 * Profile.
 *
 * The business profile is passed as CONTEXT, not as material to copy from:
 * it lets the agent ground ctaOpportunities in the contact details the
 * business actually has (no "Book online" for a business with no website)
 * and infer targetCustomer when the client didn't state one — and the
 * prompt requires it to record that inference in normalizationNotes rather
 * than presenting it as something the client said.
 */
export async function runProductAgent(
  input: {
    /** Exactly what the client typed. Never pre-summarised. */
    rawInput: string
    /** Their own name for it, when they gave one separately. */
    providedName: string
    business: {
      businessName: string | null
      industry: string | null
      services: string[]
      hasPhone: boolean
      hasWebsite: boolean
      hasAddress: boolean
      targetAudienceHint: string | null
    }
  },
  email: string,
): Promise<ProductExtraction> {
  return runJsonAgent({
    systemPrompt: PRODUCT_AGENT_SYSTEM_PROMPT,
    userInput: input,
    schema: ProductExtractionSchema,
    logContext: { email, agentType: "product" },
  })
}

/** Narrows a full BusinessProfile to the context the agent needs — booleans
 *  rather than the contact values themselves, so a phone number cannot be
 *  echoed into product copy by accident. */
export function businessContextFor(profile: BusinessProfile | null) {
  return {
    businessName: profile?.businessName ?? null,
    industry: profile?.industry ?? null,
    services: profile?.services ?? [],
    hasPhone: !!profile?.contact.phone,
    hasWebsite: !!profile?.website,
    hasAddress: !!profile?.contact.address,
    targetAudienceHint: null as string | null,
  }
}
