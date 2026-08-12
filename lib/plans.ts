import type { Plan } from "./types"

// NOTE: these three tiers are the MARKETING pricing shown on the homepage —
// see the MarketingPlanId comment in lib/types.ts. The real backend still
// only enforces two states (free: FREE_FLYER_LIMIT lifetime, pro:
// unlimited) — there's no real monthly-reset Basic tier or billing wired up
// yet. Real checkout is being built separately.
export const PLANS: Plan[] = [
  {
    id: "trial",
    name: "Free Trial",
    tagline: "See real, on-brand flyers before you commit to anything.",
    monthlyFee: 0,
    description: "Try the full AI design engine with a few flyers on us — no credit card required.",
    features: ["3 flyers free", "No credit card required"],
    note: "See exactly what you'll get before spending a dime.",
    outcome: "Perfect for testing the waters before you upgrade.",
    ctaLabel: "Start Free Trial",
  },
  {
    id: "basic",
    name: "Basic",
    tagline: "For businesses that need a steady stream of new materials.",
    monthlyFee: 75,
    description: "All the core design features, with enough flyers for a real monthly marketing cadence.",
    features: ["15 flyers per month", "All core design features"],
    note: "Refresh your flyers as often as your business needs.",
    outcome: "A steady stream of on-brand materials, every month.",
    stripeMonthlyPriceId: "price_basic_monthly_placeholder",
    ctaLabel: "Get Started",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For businesses that want the most flyers, generated first.",
    badge: "Most Popular",
    monthlyFee: 100,
    description: "Everything in Basic, with more flyers per month and priority generation.",
    features: ["25 flyers per month", "Priority generation"],
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
