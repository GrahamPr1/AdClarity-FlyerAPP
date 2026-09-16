/**
 * Early Access mode — whether the paid pricing CTAs open the waitlist modal
 * or go straight to onboarding.
 *
 * Background, because the flag is easy to misread as "is billing live":
 * there is no checkout. No Stripe route exists and the price IDs in
 * lib/plans.ts are still `price_*_placeholder`. The Early Access modal exists
 * BECAUSE there is nothing to send anyone to (see REVERT_TO_STRIPE.md).
 *
 * So turning this off does not open billing. It routes the paid CTAs to
 * `/onboarding?plan=<id>`, which calls setClientPlan server-side — meaning
 * anyone who signs in gets that plan FOR FREE, with the real server-side
 * entitlements behind it (50 flyers/month and AI-generated photos on Pro,
 * each costing real API spend). That is the intended behaviour while testing
 * the full flow; it is not something to leave on unattended in production.
 *
 * Default is ON — the waitlist — so a deploy that forgets to set this cannot
 * accidentally start giving the paid tiers away. Turning it off has to be a
 * deliberate act.
 *
 * NEXT_PUBLIC_ because components/pricing-cards.tsx is a client component and
 * this has to be readable there. It is a mode switch, not a secret.
 *
 * Nothing about the waitlist DATA is behind this flag: POST /api/waitlist,
 * /admin/waitlist and the store all stay live either way. REVERT_TO_STRIPE.md
 * is explicit that those entries are cohort data that cannot be
 * reconstructed later.
 */
export const EARLY_ACCESS_ENABLED = process.env.NEXT_PUBLIC_EARLY_ACCESS !== "off"
