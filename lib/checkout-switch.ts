/**
 * Checkout kill switch: CHECKOUT_ENABLED.
 *
 * Turns off NEW paid sign-ups without rolling back the site. When off, the
 * paid pricing CTAs say paid plans are briefly unavailable, and /checkout
 * refuses to create a Checkout Session. Everything for people who already
 * pay keeps working: the Customer Portal, plan changes and cancellation in
 * it, the Stripe webhook, pause/resume.
 *
 * ON unless explicitly switched off. Unset means on, so forgetting to set it
 * can never quietly block payments. Off = "false", "0", "off" or "no", in any
 * case.
 *
 * Read on the server only (not NEXT_PUBLIC_): the homepage passes it to the
 * pricing cards as a prop. On Vercel an env change applies to the NEXT
 * deployment, so flipping it is "change the var, then Redeploy" — which
 * rebuilds the page and the route together, so they never disagree.
 */
const OFF_VALUES = new Set(["false", "0", "off", "no"])

export function isCheckoutEnabled(value: string | undefined = process.env.CHECKOUT_ENABLED): boolean {
  if (value === undefined) return true
  return !OFF_VALUES.has(value.trim().toLowerCase())
}

export const CHECKOUT_UNAVAILABLE_MESSAGE = "Paid plans are briefly unavailable — check back soon"
