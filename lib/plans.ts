import type { Plan } from "./types"
import { PLAN_LIMITS, ANNUAL_DISCOUNT_PERCENT } from "./types"

// Derived, not hand-typed, per plan below — see ANNUAL_DISCOUNT_PERCENT's
// own note on why this can't just be a second literal number per plan.
const annualMonthlyFee = (monthlyFee: number) => Math.round(monthlyFee * (1 - ANNUAL_DISCOUNT_PERCENT / 100))

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
    annualMonthlyFee: annualMonthlyFee(19),
    description: "Everything in Trial, plus scan tracking, multi-channel content, and print requests.",
    features: [
      `${PLAN_LIMITS.basic} flyers every month`,
      "QR scan & click tracking on every flyer",
      "Instagram, text-blast & Nextdoor versions included",
      "Request printed copies, shipped to you (quoted per order)",
    ],
    note: "No contract — cancel anytime, keep every flyer you've made.",
    outcome: "A steady set of on-brand materials — and proof they're working.",
    stripeMonthlyPriceId: "price_basic_monthly_placeholder",
    stripeAnnualPriceId: "price_basic_annual_placeholder",
    ctaLabel: "Start Creating Flyers",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For businesses that want the most flyers and the least paperwork.",
    badge: "Most Popular",
    monthlyFee: 39,
    annualMonthlyFee: annualMonthlyFee(39),
    // Pro's differentiators are the ones actually enforced server-side: twice
    // the monthly allowance, and AI-generated photos (planAllowsAiPhotos in
    // lib/agent-pipeline/plan-features.ts is Pro-only and gated for real).
    //
    // This tier previously sold "a saved Business Profile that fills out any
    // form for you" in its description, a feature line, the note AND the
    // outcome — four times over. That profile is not Pro-only: /profile and
    // /api/campaign-defaults have no plan check, so every tier including
    // Trial already has it. Meanwhile the one genuinely exclusive feature
    // wasn't mentioned anywhere. Charging for something everyone gets, while
    // hiding what they'd actually be paying for, is the wrong way round.
    description: "Everything in Basic, plus AI-generated photos, coloring pages, and double the monthly campaigns.",
    features: [
      `${PLAN_LIMITS.pro} flyers every month — double Basic`,
      "Everything in Basic",
      "AI-generated photos for flyers when you have none of your own",
      "Printable coloring pages — black-and-white line art from any description",
    ],
    note: "The only tier that can generate its own imagery — for trades without a photo library, that's the difference between a flyer with a picture and one without.",
    outcome: "Twice the output, and a photo on every flyer even when you don't have one to hand.",
    mostPopular: true,
    stripeMonthlyPriceId: "price_pro_monthly_placeholder",
    stripeAnnualPriceId: "price_pro_annual_placeholder",
    ctaLabel: "Get the Pro Plan",
  },
]

export function getPlan(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
