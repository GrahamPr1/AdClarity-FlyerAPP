import type { Plan } from "./types"
import { FREE_FLYER_LIMIT } from "./types"

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "See real, on-brand flyers before you commit to anything.",
    monthlyFee: 0,
    description: `Generate up to ${FREE_FLYER_LIMIT} flyers, no credit card required — full access to the same AI design engine Pro users get.`,
    features: [
      `${FREE_FLYER_LIMIT} flyers included`,
      "All core design features — brand-matched colors, fonts & layouts",
      "No credit card required",
    ],
    note: `Your ${FREE_FLYER_LIMIT} free flyers never expire. Upgrade anytime for unlimited.`,
    outcome: "Perfect for testing the waters before you upgrade.",
    ctaLabel: "Start for free",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For businesses that need a steady stream of new materials.",
    badge: "Most Popular",
    monthlyFee: 29,
    description: "Everything in Free, with no cap on how many flyers you generate.",
    features: [
      "Unlimited flyers",
      "Priority generation — jump the queue",
      "Priority support",
    ],
    note: "Generate as many flyers as you need, whenever you need them.",
    outcome: "Never worry about running out of flyers again.",
    mostPopular: true,
    stripeMonthlyPriceId: "price_pro_monthly_placeholder",
    // No real checkout wired yet — a button labeled "Upgrade to Pro" that
    // silently does nothing (or just redirects to onboarding) would imply a
    // real upgrade happened. Contact-us is the honest interim CTA until
    // Stripe is wired to stripeMonthlyPriceId.
    ctaLabel: "Contact us to upgrade",
    ctaHref: "mailto:hello@oneflyer.co?subject=Upgrade%20to%20OneFlyer%20Pro",
  },
]

export function getPlan(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
