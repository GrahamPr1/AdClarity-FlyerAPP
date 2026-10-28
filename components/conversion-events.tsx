"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { flushBeginCheckout, flushPendingSignup, reportCheckoutResult } from "@/lib/analytics"

/**
 * Sends the conversions a full page navigation would have lost, on the first
 * OneFlyer page afterwards (all in lib/analytics.ts):
 * - a signup queued on the way to Stripe Checkout (queueSignup);
 * - the begin_checkout /checkout queued in a cookie before redirecting;
 * - on Stripe's success page, the purchase, once the server confirms it.
 * Mounted once in the root layout and re-checked on every route change,
 * because /checkout's own redirects (to /dashboard or /#pricing) can resolve
 * as a client-side navigation that keeps this layout mounted. StrictMode's
 * double effect is harmless: each one is once-only per Stripe or signup id.
 */
export function ConversionEvents() {
  const pathname = usePathname()
  useEffect(() => {
    flushPendingSignup()
    // Checkout conversions, in funnel order: the begin_checkout queued before
    // Stripe, then (success page only, server-confirmed) the purchase.
    flushBeginCheckout()
    void reportCheckoutResult()
  }, [pathname])
  return null
}
