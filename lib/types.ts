// ---------------------------------------------------------------------------
// OneFlyer shared data contracts
//
// These interfaces define the shapes exchanged between the marketing site,
// the client dashboard, and the EXTERNAL flyer-generation pipeline (built
// outside of v0). Keep them stable so the pipeline can match up cleanly.
// ---------------------------------------------------------------------------

export type PlanId = "trial" | "base" | "pro"

export interface Plan {
  id: PlanId
  name: string
  /** Short punchy positioning line under the name */
  tagline: string
  /** Small badge shown on the card, e.g. "Most Popular" / "Best Value" */
  badge?: string
  /** Recurring price in whole dollars. 0 for the free trial. */
  price: number
  /** Small label shown next to the price, e.g. "/mo" or "free for 3 days" */
  priceLabel: string
  /**
   * The flyer allowance EXACTLY as the product enforces it — this is the hard
   * limit, not a marketing promise. e.g. "3 flyers total", "15 flyers / month",
   * "Unlimited flyers".
   */
  flyerLimit: string
  /** The numeric hard cap the backend enforces. null = unlimited. */
  flyerCap: number | null
  /** How the cap resets, surfaced to the user. */
  flyerPeriod: "trial" | "month" | "unlimited"
  description: string
  features: string[]
  /** Optional highlight chip (amber) reinforcing the tier's key value */
  highlight?: string
  mostPopular?: boolean
  /** Placeholder Stripe price ID — wire this to a real price later */
  stripePriceId: string
  ctaLabel: string
}

/** Shared reassurance line shown beneath the plans */
export const PLAN_GUARANTEE = "Cancel anytime · No long-term contracts · Start with a free 3-day trial"

// ---- Intake / onboarding -------------------------------------------------

export type BrandStyle = "modern" | "classic" | "playful" | "minimal"

export interface ServiceItem {
  id: string
  name: string
}

export interface IntakeSubmission {
  planId: PlanId | null
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
