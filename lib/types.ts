// ---------------------------------------------------------------------------
// AdClarity shared data contracts
//
// These interfaces define the shapes exchanged between the marketing site,
// the client dashboard, and the EXTERNAL Claude-based agent pipeline (built
// outside of v0). Keep them stable so the pipeline can match up cleanly.
// ---------------------------------------------------------------------------

export type PlanId = "foundation" | "foundation_plus"

export interface Plan {
  id: PlanId
  name: string
  /** Short punchy positioning line under the name */
  tagline: string
  /** Small badge shown on the card, e.g. "Most Popular" / "Best Value" */
  badge?: string
  /** One-time build fee in whole dollars */
  setupFee: number
  /** Recurring monthly retainer in whole dollars. 0 when the monthly amount is the client-chosen ad spend. */
  monthlyFee: number
  /** When true, the monthly amount is the client's chosen ad spend (entered at checkout) rather than a fixed retainer. */
  hasAdSpend?: boolean
  /** Framing of the real-world value delivered, e.g. "$8,000+ in agency build value" */
  valueAnchor: string
  description: string
  features: string[]
  /** Explains what the monthly retainer buys the client (ongoing updates, refresh limits, etc.) */
  retainerNote: string
  /** A short outcome-focused line reinforcing the result they get */
  outcome: string
  mostPopular?: boolean
  /** Placeholder Stripe price IDs — wire these to real prices later */
  stripeSetupPriceId: string
  stripeMonthlyPriceId: string
  ctaLabel: string
}

/** Shared guarantee/reassurance line shown beneath both plans */
export const PLAN_GUARANTEE = "14-day satisfaction guarantee · Cancel anytime · You own everything we build"

/** Explains the monthly retainer model shown beneath the pricing grid */
export const RETAINER_EXPLANATION =
  "After your one-time build fee, the low monthly retainer keeps your account active so you can come back anytime and have your materials refreshed, rewritten, and re-designed as your business changes — up to 20 flyers per month included. Your build isn't a one-and-done file dump; it's a living system you can keep updating."

/** Default and minimum monthly ad spend (whole dollars) for the plan that includes paid ads */
export const AD_SPEND_MIN = 300
export const AD_SPEND_DEFAULT = 500

// ---- Intake / onboarding -------------------------------------------------

export type BrandStyle = "modern" | "classic" | "playful" | "minimal"

export interface ServiceItem {
  id: string
  name: string
}

export interface IntakeSubmission {
  planId: PlanId | null
  /** Monthly ad spend in whole dollars — only set for the plan that includes paid ads */
  adSpend?: number
  businessName: string
  industry: string
  yearsInBusiness: string
  services: ServiceItem[]
  logoFileName?: string
  brandColors?: string
  preferredStyle: BrandStyle
  voiceTone: string
  targetAudience: string
  contact: {
    phone: string
    address: string
    website: string
    socialHandles: string
  }
  existingMaterialsFileName?: string
  flyerNotes: string
  websitePreferences: string
  submittedAt?: string
}

// ---- Deliverables / dashboard --------------------------------------------

export type FlyerStatus = "Pending" | "In Progress" | "Ready"
export type WebsiteStatus = "Pending" | "In Progress" | "Live"
export type IntakeStatus = "Submitted" | "Not started"
export type BillingStatus = "Active" | "Past due" | "Trialing"

export interface FlyerDeliverable {
  id: string
  title: string
  status: FlyerStatus
  thumbnailUrl?: string
  downloadUrl?: string
}

export interface WebsiteDeliverable {
  id: string
  status: WebsiteStatus
  url?: string
}

export interface Deliverables {
  planId: PlanId
  planName: string
  billingStatus: BillingStatus
  intakeStatus: IntakeStatus
  flyers: FlyerDeliverable[]
  website: WebsiteDeliverable
}
