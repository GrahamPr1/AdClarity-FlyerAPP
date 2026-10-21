import type { MemberBilling, PlanId } from "./types"

// ---------------------------------------------------------------------------
// Which usage window a client is in right now — pure, so it can be tested
// without Redis or Stripe. lib/store.ts applies the result (resetting
// flyersCreated when the window has moved on).
//
// Two clocks:
//
//  - A paid Stripe subscriber's window is the subscription's own billing
//    period, so "25 flyers a month" resets on the same day they're charged,
//    not on an unrelated 30-day clock that drifts away from it.
//
//    Annual plans are still MONTHLY allowances ("25 flyers every month"), so
//    the year is split into month steps from the period start. Using the
//    raw annual period would turn 25/month into 25/year.
//
//    A NEW billing period only resets usage once its invoice is paid. A
//    renewal whose payment fails (past_due) keeps counting against the
//    previous allowance — otherwise a declined card would hand out a fresh
//    month of flyers while Stripe is still trying to collect for it.
//
//  - Everyone else (free trial, an admin override with no subscription, a
//    lapsed subscriber) keeps the original rolling 30 days.
// ---------------------------------------------------------------------------

export const RESET_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

/** Statuses whose billing period should drive the usage window. Mirrors ENTITLED_STATUSES in lib/stripe.ts (kept here so this file stays free of the Stripe SDK). */
const STRIPE_ANCHORED_STATUSES = new Set(["active", "trialing", "past_due"])

export interface UsageWindow {
  start: number
  end: number
  source: "stripe" | "rolling"
}

export function usageWindow(
  now: number,
  plan: PlanId,
  storedStart: number | null,
  billing: MemberBilling | null,
): UsageWindow {
  const sub = stripePeriod(billing)
  if (sub && plan !== "trial") {
    const window = stripeWindow(now, sub)
    // The period moved on but hasn't been paid for: stay in the allowance
    // already running (no reset) until the invoice is paid.
    if (!sub.paid && storedStart !== null && storedStart < sub.start) {
      return { start: storedStart, end: window.end, source: "stripe" }
    }
    return { ...window, source: "stripe" }
  }
  if (storedStart !== null && now - storedStart < RESET_PERIOD_MS && now >= storedStart) {
    return { start: storedStart, end: storedStart + RESET_PERIOD_MS, source: "rolling" }
  }
  return { start: now, end: now + RESET_PERIOD_MS, source: "rolling" }
}

interface StripePeriod {
  start: number
  end: number
  annual: boolean
  paid: boolean
}

/** The billing period that should drive the window, or null to use the rolling clock. */
function stripePeriod(billing: MemberBilling | null): StripePeriod | null {
  if (!billing || !billing.status || !STRIPE_ANCHORED_STATUSES.has(billing.status)) return null
  const { currentPeriodStart: start, currentPeriodEnd: end } = billing
  if (start == null || end == null || end <= start) return null
  return { start, end, annual: billing.interval === "annual", paid: billing.currentPeriodPaid !== false }
}

function stripeWindow(now: number, sub: StripePeriod): { start: number; end: number } {
  const { start, end } = sub
  if (!sub.annual) return { start, end }

  // Latest month step that has begun, never past the period. If `now` is
  // already beyond the period end (renewal webhook not in yet), stay in the
  // final step rather than granting a fresh allowance before Stripe has
  // actually renewed.
  let k = 0
  while (k < 11 && addMonthsUtc(start, k + 1) <= now) k++
  return { start: addMonthsUtc(start, k), end: Math.min(addMonthsUtc(start, k + 1), end) }
}

/** Calendar-month add in UTC, clamping to the last day of a shorter month (Jan 31 → Feb 28), the way Stripe anchors billing dates. */
export function addMonthsUtc(ms: number, months: number): number {
  const d = new Date(ms)
  const targetMonth = d.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate()
  return Date.UTC(
    d.getUTCFullYear(),
    targetMonth,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  )
}
