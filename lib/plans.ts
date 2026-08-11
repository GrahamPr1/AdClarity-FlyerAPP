import type { Plan } from "./types"

export const PLANS: Plan[] = [
  {
    id: "foundation",
    name: "Basic",
    tagline: "Own a real marketing engine — not scattered vendors.",
    badge: "Best Value",
    setupFee: 250,
    monthlyFee: 50,
    valueAnchor: "$8,000+ in agency-grade build value",
    description:
      "A complete, done-for-you brand and reputation system that you own outright — built once, then kept fresh for just $50/mo.",
    features: [
      "Full brand identity & collateral system",
      "Professionally designed flyers, sheets & one-pagers",
      "Conversion-focused website / landing page refresh",
      "Referral & partner growth kit",
      "Automated review-generation engine",
      "Referral program setup & tracking",
      "Google Business Profile & listings management",
      "Dedicated client dashboard to track & download everything",
    ],
    retainerNote:
      "Your $50/mo keeps your account active so you can come back anytime for updates and re-designs — up to 20 flyers per month included.",
    outcome: "Look like the most established business in your market within weeks.",
    stripeSetupPriceId: "price_basic_setup_placeholder",
    stripeMonthlyPriceId: "price_basic_monthly_placeholder",
    ctaLabel: "Start with Basic",
  },
  {
    id: "foundation_plus",
    name: "Plus",
    tagline: "Everything in Basic, plus paid ads that scale with you.",
    badge: "Most Popular",
    setupFee: 500,
    monthlyFee: 0,
    hasAdSpend: true,
    valueAnchor: "$15,000+ in agency-grade build value",
    description:
      "The complete growth system — your owned foundation supercharged with managed paid advertising, at whatever monthly ad budget you choose.",
    features: [
      "Everything in Basic — nothing left out",
      "Managed paid advertising (Google & Meta)",
      "You set your own monthly ad budget",
      "Ad creative, copy & targeting handled for you",
      "Organic content engine & social posts",
      "AI receptionist & 24/7 chat capture",
      "Automated email & SMS follow-up sequences",
      "Monthly performance & growth reporting",
    ],
    retainerNote:
      "Your one-time $500 build fee, then you fund whatever monthly ad spend you want — set it at checkout and change it anytime. Ongoing updates included, up to 20 flyers per month.",
    outcome: "A marketing team's output — content, reviews, follow-up, and paid ads — running for you every single day.",
    mostPopular: true,
    stripeSetupPriceId: "price_plus_setup_placeholder",
    stripeMonthlyPriceId: "price_plus_adspend_placeholder",
    ctaLabel: "Get the Plus plan",
  },
]

export function getPlan(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}
