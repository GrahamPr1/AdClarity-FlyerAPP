import type { NormalizedIntake } from "./schemas/intake"
import type { BusinessProfile } from "@/lib/business-profile"
import type { ProductProfile } from "@/lib/product-profile"
import { productPurpose } from "@/lib/product-profile"
import { anglesFor, type CreativeAngle } from "./creative-angles"

/**
 * Assembles the generator's input from structured records instead of a
 * freeform prompt.
 *
 * This is the Phase 3 "better generation logic" in one function: the Flyer
 * Agent stops receiving a sentence someone typed and starts receiving
 * Business Profile + Product Profile + campaign objective + creative
 * variation instructions, each from a record that was reviewed and can be
 * corrected.
 *
 * It deliberately produces a NormalizedIntake — the shape the existing
 * pipeline already takes — rather than a new contract. continuePipelineFromIntake,
 * the Brand Agent, the Flyer Agent, photo sourcing, QR tracking and the
 * retry/refine paths all keep working untouched. This is the adapter, not a
 * second engine.
 */

export type BuildContextError =
  | { ok: false; reason: "no_business"; message: string }
  | { ok: false; reason: "no_contact"; message: string }

export type BuildContextResult =
  | { ok: true; intake: NormalizedIntake; angles: CreativeAngle[] }
  | BuildContextError

/**
 * A flyer with no way to respond to it is a poster, not marketing — and
 * NormalizedIntake requires a non-empty phone, so this is also a hard
 * structural requirement rather than only a quality one. Website or email
 * stand in when there is no phone, which is common for online-only trades.
 */
function contactLine(business: BusinessProfile): string | null {
  return (
    business.contact.phone?.trim() ||
    business.contact.email?.trim() ||
    business.website?.trim() ||
    null
  )
}

/**
 * CTA text grounded in contact details the business ACTUALLY has.
 *
 * The product's own ctaOpportunities win when present — the client (via the
 * Product Agent) said what they want asked for. Otherwise a CTA is derived
 * from whichever contact channel exists. Never suggests an action the
 * business cannot receive: no "Book online" without a website, no "Call us"
 * without a phone.
 */
export function ctaCandidates(business: BusinessProfile, product: ProductProfile): string[] {
  const fromProduct = product.ctaOpportunities.map((c) => c.trim()).filter(Boolean)
  if (fromProduct.length > 0) return fromProduct.slice(0, 4)

  const out: string[] = []
  if (business.contact.phone) out.push(`Call ${business.contact.phone}`)
  if (business.website) out.push("Visit our website")
  if (business.contact.email) out.push("Email us")
  if (business.contact.address) out.push("Visit us in person")
  return out.slice(0, 4)
}

/**
 * The per-variation brief. Everything factual the Flyer Agent is allowed to
 * use about this product, plus the one creative instruction that makes this
 * variation different from its siblings.
 *
 * Limitations are stated as MUST APPEAR rather than as background, because a
 * dropped "new customers only" is a false advertisement, not a style miss.
 */
function variationNotes(product: ProductProfile, angle: CreativeAngle, ctas: string[]): string {
  const lines: string[] = [`CREATIVE ANGLE — ${angle.name}: ${angle.brief}`]

  if (product.offer?.trim()) lines.push(`OFFER (use verbatim, do not restate the terms): ${product.offer.trim()}`)
  if (product.pricing?.trim()) lines.push(`PRICING (verbatim, never round or estimate): ${product.pricing.trim()}`)
  if (product.features.length) lines.push(`FEATURES: ${product.features.join("; ")}`)
  if (product.benefits.length) lines.push(`BENEFITS: ${product.benefits.join("; ")}`)
  if (product.claims.length) lines.push(`APPROVED CLAIMS (the only claims you may make): ${product.claims.join("; ")}`)
  if (product.limitations.length) {
    lines.push(`MUST APPEAR ON THE FLYER — offer conditions: ${product.limitations.join("; ")}`)
  }
  if (product.targetCustomer?.trim()) lines.push(`AUDIENCE: ${product.targetCustomer.trim()}`)
  if (ctas.length) lines.push(`CALL TO ACTION — use one of these, prominently: ${ctas.join(" | ")}`)

  lines.push(
    "Every fact above came from the business owner. Do not add prices, dates, phone numbers, addresses, guarantees or claims that are not listed here.",
  )
  return lines.join("\n")
}

export function buildCampaignContext(
  business: BusinessProfile | null,
  product: ProductProfile,
  opts: {
    /** How many creative options to generate. */
    variations: number
    /** Output format id, e.g. "flyer" or "door-hanger". */
    formatId?: string
    /** Stable ids for the requests, so callers control tracking/retry keys. */
    ids: string[]
  },
): BuildContextResult {
  if (!business || !business.businessName?.trim()) {
    return {
      ok: false,
      reason: "no_business",
      message: "Set up your business first — OneFlyer needs to know who the flyer is for.",
    }
  }

  const contact = contactLine(business)
  if (!contact) {
    return {
      ok: false,
      reason: "no_contact",
      message:
        "Add a phone number, email or website to your business details — a flyer needs at least one way for customers to respond.",
    }
  }

  const angles = anglesFor(product, opts.variations)
  const ctas = ctaCandidates(business, product)

  // Services: the product being advertised leads, with the business's own
  // service list behind it. The schema requires at least one.
  const services = Array.from(
    new Set([product.name.trim(), ...business.services.map((s) => s.trim())].filter(Boolean)),
  ).slice(0, 12)

  const intake: NormalizedIntake = {
    businessName: business.businessName.trim(),
    industry: business.industry?.trim() || "General business",
    yearsInBusiness: null,
    services: services.length ? services : [product.name.trim() || "Our service"],
    targetAudience:
      product.targetCustomer?.trim() || business.description?.trim() || "Local customers",
    contact: {
      phone: contact,
      address: business.contact.address,
      website: business.website,
      social: business.contact.social.length ? business.contact.social : null,
      contactName: null,
    },
    brandAssets: {
      // Inherited, not re-asked. This is 3A: a client uploads a logo once.
      logoUrl: business.brand.logoUrl,
      existingColors: business.brand.colors
        ? [business.brand.colors.primary, business.brand.colors.secondary, business.brand.colors.accent].filter(
            (c): c is string => !!c,
          )
        : null,
      existingFontsNote: null,
    },
    voiceTonePreference: business.brand.tone?.trim() || "professional and straightforward",
    fontStylePreference: "modern",
    photos: product.imageUrls.map((url) => ({ url, caption: product.name })),
    // Never inferred — a client's own consent choices. Defaults match the
    // documented defaults in lib/types.ts.
    wantsAiPhotos: false,
    wantsQrCode: true,
    flyerRequests: opts.ids.slice(0, opts.variations).map((id, i) => ({
      id,
      purpose: productPurpose(product),
      notes: variationNotes(product, angles[i] ?? angles[0], ctas),
      ...(opts.formatId ? { formatId: opts.formatId } : {}),
    })),
    websitePreferences: null,
    existingMaterialsNotes: null,
    batchSize: opts.variations,
  }

  return { ok: true, intake, angles }
}
