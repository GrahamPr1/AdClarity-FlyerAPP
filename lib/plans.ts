import type { Plan } from "./types"
import { PLAN_LIMITS } from "./types"

// Annual prices are stated per plan, in whole dollars, and must equal the
// annual Stripe Prices exactly (STRIPE_PRICE_*_ANNUAL). The monthly equivalent
// and the savings percentage are DERIVED from them, never typed separately, so
// the pricing page can't advertise a figure the card isn't charged.
//
// There is deliberately no single "annual discount" constant: the saving is
// different per plan ($180 vs $228 for Basic is 21%; $360 vs $468 for Pro is
// 23%), and a shared "20%" would be wrong for both.
const annualMonthlyFee = (annualFee: number) => Math.round((annualFee / 12) * 100) / 100

// Real enforcement uses PLAN_LIMITS directly (see lib/types.ts) so this
// marketing copy can't drift out of sync with what's actually enforced.
// All three caps reset every 30 days (see the note on PLAN_LIMITS).
//
// Prices repriced from the original $75/$100 once QR tracking, multi-
// channel repurposing, saved Business Profile, and print requests shipped
// — the old numbers were priced like a premium tool against Canva Pro
// (~$12-15/mo, AI design included), which made Basic a hard sell before it
// even got to what's different. $19/$39 is grounded in what each tier
// actually includes now (see hasExtraFeatures in lib/agent-pipeline/
// pipeline.ts and the plan checks in /api/print-requests and
// /api/business-profile for the REAL enforcement these bullets describe —
// not just marketing copy).
export const PLANS: Plan[] = [
  {
    id: "trial",
    name: "Free Trial",
    tagline: "See real, on-brand flyers before you commit to anything.",
    monthlyFee: 0,
    annualFee: 0,
    annualMonthlyFee: 0,
    description: "Try the full AI design engine with a few flyers on us — no credit card required.",
    features: [`${PLAN_LIMITS.trial} flyers free`, "No credit card required"],
    note: "See exactly what you'll get before spending a dime.",
    outcome: "Perfect for testing the waters before you upgrade.",
    ctaLabel: "Start Free Trial",
  },
  {
    id: "basic",
    name: "Basic",
    tagline: "For businesses that want to know a flyer actually worked.",
    monthlyFee: 19,
    annualFee: 180,
    annualMonthlyFee: annualMonthlyFee(180),
    description: "Everything in Trial, plus scan tracking, multi-channel content, and print requests.",
    features: [
      `${PLAN_LIMITS.basic} flyers every month`,
      "QR scan & click tracking on every flyer",
      "Instagram, text-blast & Nextdoor versions included",
      "Request printed copies, shipped to you (quoted per order)",
    ],
    note: "No contract — cancel anytime, keep every flyer you've made.",
    outcome: "A steady set of on-brand materials — and proof they're working.",
    ctaLabel: "Start Creating Flyers",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For businesses that want the most flyers and the least paperwork.",
    badge: "Most Popular",
    monthlyFee: 39,
    annualFee: 360,
    annualMonthlyFee: annualMonthlyFee(360),
    // Pro's differentiators are the ones actually enforced server-side: twice
    // the monthly allowance, and an AI-generated image as a FALLBACK
    // (planAllowsAiPhotos in lib/agent-pipeline/plan-features.ts is Pro-only
    // and gated for real, on top of the client's opt-in).
    //
    // Photos themselves are NOT Pro-only, so the copy must not imply they
    // are: every tier gets a matching Unsplash stock photo when the client
    // has none of their own (stockPhotosEnabled). Generation runs only when
    // Unsplash has nothing on-topic, and can still come back empty — in which
    // case the flyer uses a photo-free design. Hence no "photo on every
    // flyer" promise. See buildPhotoPool in lib/agent-pipeline/pipeline.ts.
    //
    // This tier previously sold "a saved Business Profile that fills out any
    // form for you" in its description, a feature line, the note AND the
    // outcome — four times over. That profile is not Pro-only: /profile and
    // /api/campaign-defaults have no plan check, so every tier including
    // Trial already has it. Meanwhile the one genuinely exclusive feature
    // wasn't mentioned anywhere. Charging for something everyone gets, while
    // hiding what they'd actually be paying for, is the wrong way round.
    description: "Everything in Basic, plus double the monthly campaigns and AI-generated images when no stock photo fits.",
    features: [
      `${PLAN_LIMITS.pro} flyers every month — double Basic`,
      "Everything in Basic",
      "AI-generated images when neither your photos nor our stock library has a match (opt-in)",
    ],
    note: "Every plan uses your photos first, then a matching stock photo. Pro adds an AI-generated image for when the stock library has nothing that fits — useful for niche trades.",
    outcome: "Twice the output, and a better chance of a picture on every flyer — even for work stock libraries don't cover.",
    mostPopular: true,
    ctaLabel: "Get the Pro Plan",
  },
]

/**
 * The auto-renewal disclosure shown next to every paid "buy" button: under the
 * Basic and Pro pricing CTAs, and above Stripe Checkout's Subscribe button
 * (custom_text in lib/billing.ts). One function so the two can't drift apart.
 *
 * "In a few clicks", not a number: cancelling from /profile is Manage billing
 * → Cancel subscription → Continue → confirm in the Stripe Customer Portal.
 * Auto-renewal rules scrutinise exactly this sentence, so it must stay true
 * if the portal flow changes.
 */
export function renewalDisclosure(interval: "monthly" | "annual"): string {
  return `Renews automatically ${interval === "annual" ? "yearly" : "monthly"} until you cancel. Cancel anytime online in a few clicks.`
}

/**
 * How much the yearly price saves against twelve monthly payments, as a whole
 * percentage ROUNDED DOWN — so the "Save X%" claim can only ever understate.
 * Basic: 1 − 180/228 = 21.05% → 21. Pro: 1 − 360/468 = 23.08% → 23.
 */
export function annualSavingsPercent(plan: Pick<Plan, "monthlyFee" | "annualFee">): number {
  const yearOfMonthly = plan.monthlyFee * 12
  if (!yearOfMonthly || !plan.annualFee) return 0
  return Math.floor(((yearOfMonthly - plan.annualFee) / yearOfMonthly) * 100)
}

/** The best saving on offer — what "save up to X%" on the toggle may truthfully claim. */
export function maxAnnualSavingsPercent(): number {
  return Math.max(0, ...PLANS.map(annualSavingsPercent))
}

export function getPlan(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
