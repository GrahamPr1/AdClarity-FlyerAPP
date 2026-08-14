import type { Plan } from "./types"
import { PLAN_LIMITS } from "./types"

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
    description: "Everything in Trial, plus scan tracking, multi-channel content, and print requests.",
    features: [
      `${PLAN_LIMITS.basic} flyers every month`,
      "QR scan & click tracking on every flyer",
      "Instagram, text-blast & Nextdoor versions included",
      "Request printed copies, shipped to you",
    ],
    note: `${PLAN_LIMITS.basic} flyers per month, resetting automatically.`,
    outcome: "A steady set of on-brand materials — and proof they're working.",
    stripeMonthlyPriceId: "price_basic_monthly_placeholder",
    ctaLabel: "Get Started",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For businesses that want the most flyers, generated first.",
    badge: "Most Popular",
    monthlyFee: 39,
    description: "Everything in Basic, plus a saved Business Profile and priority generation.",
    features: [
      `${PLAN_LIMITS.pro} flyers every month`,
      "Everything in Basic",
      "Save your business info once, reuse it on any form",
      "Priority generation",
    ],
    note: "Your flyers jump the queue and finish first.",
    outcome: "Never wait on your marketing materials again.",
    mostPopular: true,
    stripeMonthlyPriceId: "price_pro_monthly_placeholder",
    ctaLabel: "Get Started",
  },
]

export function getPlan(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
