import type { Plan } from "./types"
import { PLAN_LIMITS } from "./types"

// Real enforcement uses PLAN_LIMITS directly (see lib/types.ts) so this
// marketing copy can't drift out of sync with what's actually enforced.
// All three caps reset every 30 days (see the note on PLAN_LIMITS).
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
    tagline: "For businesses that need a steady stream of new materials.",
    monthlyFee: 75,
    description: "All the core design features, with enough flyers for a real marketing push.",
    features: [`${PLAN_LIMITS.basic} flyers every month`, "All core design features"],
    note: `${PLAN_LIMITS.basic} flyers per month, resetting automatically.`,
    outcome: "A steady set of on-brand materials to launch with.",
    stripeMonthlyPriceId: "price_basic_monthly_placeholder",
    ctaLabel: "Get Started",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For businesses that want the most flyers, generated first.",
    badge: "Most Popular",
    monthlyFee: 100,
    description: "Everything in Basic, with more flyers and priority generation.",
    features: [`${PLAN_LIMITS.pro} flyers every month`, "Priority generation"],
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
