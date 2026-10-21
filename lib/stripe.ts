import Stripe from "stripe"
import type { BillingInterval, PlanId } from "./types"
import { getAppEnvironment } from "./env"

// ---------------------------------------------------------------------------
// Stripe billing for the public self-serve plans (Basic, Pro).
//
// SERVER ONLY. Holds the secret key; never import this from a client
// component. lib/plans.ts is the client-safe half (names, prices for display).
//
// The API version is pinned rather than left to the account default, and the
// SDK is pinned to the exact release that ships with it (stripe@18.3.0), so a
// dashboard-side version bump can never silently change the shape of the
// objects the webhook reads. In particular, under basil the billing period
// lives on the subscription ITEM, not the subscription — see
// subscriptionPeriod below.
// ---------------------------------------------------------------------------

export const STRIPE_API_VERSION = "2025-06-30.basil" as const

let client: Stripe | null = null

/**
 * The one Stripe client.
 *
 * Refuses a live key anywhere but production. Live keys are meant to reach
 * production only; a laptop or a preview holding one could create real
 * charges against real cards from a test run.
 */
export function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
  if (/^(sk|rk)_live_/.test(key) && getAppEnvironment() !== "production") {
    throw new Error(`Refusing a live Stripe key in "${getAppEnvironment()}" — use a sandbox key outside production.`)
  }
  client = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true })
  return client
}

// ---- Prices ---------------------------------------------------------------
//
// Price IDs come from env, not code, so swapping sandbox for live is a config
// change and the live IDs never land in git. Created once by
// scripts/stripe-sandbox-setup.ts, not at runtime.

export type PaidPlanId = Extract<PlanId, "basic" | "pro">

const PRICE_ENV: Record<PaidPlanId, Record<BillingInterval, string>> = {
  basic: { monthly: "STRIPE_PRICE_BASIC_MONTHLY", annual: "STRIPE_PRICE_BASIC_ANNUAL" },
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", annual: "STRIPE_PRICE_PRO_ANNUAL" },
}

export function isPaidPlanId(v: unknown): v is PaidPlanId {
  return v === "basic" || v === "pro"
}

export function priceIdFor(plan: PaidPlanId, interval: BillingInterval): string {
  const name = PRICE_ENV[plan][interval]
  const id = process.env[name]
  if (!id) throw new Error(`${name} is not set`)
  return id
}

/** Reverse lookup: which plan a Stripe price grants. Null for a price this app doesn't sell — never guessed. */
export function planForPriceId(priceId: string | null | undefined): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (!priceId) return null
  for (const plan of Object.keys(PRICE_ENV) as PaidPlanId[]) {
    for (const interval of Object.keys(PRICE_ENV[plan]) as BillingInterval[]) {
      if (process.env[PRICE_ENV[plan][interval]] === priceId) return { plan, interval }
    }
  }
  return null
}

// ---- Subscription → entitlement --------------------------------------------

/**
 * Statuses that carry the paid plan.
 *
 * past_due is included on purpose: it means a renewal charge failed and Stripe
 * is still retrying. Yanking the plan on the first decline would punish an
 * expired card harder than the retry schedule does; the account drops to the
 * free tier when Stripe gives up (canceled / unpaid), not before.
 *
 * incomplete is NOT: the first payment never succeeded, so nothing was paid for.
 */
const ENTITLED_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set(["active", "trialing", "past_due"])

export function isEntitledStatus(status: Stripe.Subscription.Status): boolean {
  return ENTITLED_STATUSES.has(status)
}

/** Under basil the period is per item. This app sells exactly one item per subscription. */
export function subscriptionPeriod(sub: Stripe.Subscription): { start: number; end: number } {
  const item = sub.items.data[0]
  if (!item) throw new Error(`Subscription ${sub.id} has no items`)
  return { start: item.current_period_start * 1000, end: item.current_period_end * 1000 }
}
