import { getPlan } from "./plans"
import type { BillingInterval } from "./types"

/**
 * The begin_checkout and purchase conversions' shared shapes, used by the
 * server (which decides WHEN they may fire) and the client (which sends them,
 * lib/analytics.ts). Pure: no Stripe, no Redis, nothing personal.
 *
 * Both events carry GA4's ecommerce fields. GTM sees them because gtag()
 * pushes onto the shared dataLayer, and exposes the parameters under
 * `eventModel` (Data Layer Variables `eventModel.value`, `eventModel.currency`,
 * `eventModel.transaction_id`).
 */

/** Set by /checkout when it has created a real Stripe Checkout Session; read and cleared by the next OneFlyer page. */
export const BEGIN_CHECKOUT_COOKIE = "oneflyer_begin_checkout"

export interface CheckoutItem {
  item_id: string
  item_name: string
  item_variant: BillingInterval
  price: number
  quantity: 1
}

export interface BeginCheckoutParams {
  currency: "USD"
  value: number
  plan: string
  interval: BillingInterval
  items: CheckoutItem[]
}

export interface PurchaseParams extends BeginCheckoutParams {
  /** The Stripe subscription id: GA4 drops a second purchase with the same one. */
  transaction_id: string
}

function planOrThrow(plan: string) {
  const p = getPlan(plan)
  if (!p) throw new Error(`Unknown plan: ${plan}`)
  return p
}

/** The plan's list price for the interval, in whole dollars (pre-tax). */
export function planPrice(plan: string, interval: BillingInterval): number {
  const p = planOrThrow(plan)
  return interval === "annual" ? p.annualFee : p.monthlyFee
}

export function checkoutParams(plan: string, interval: BillingInterval, value = planPrice(plan, interval)): BeginCheckoutParams {
  const name = planOrThrow(plan).name
  return {
    currency: "USD",
    value,
    plan,
    interval,
    items: [{ item_id: plan, item_name: name, item_variant: interval, price: value, quantity: 1 }],
  }
}

/** The cookie's payload: the Checkout Session id (the once-only key) and the params to send. */
export interface PendingBeginCheckout {
  id: string
  params: BeginCheckoutParams
}
