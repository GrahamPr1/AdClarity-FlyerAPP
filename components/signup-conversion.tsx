"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { flushPendingSignup } from "@/lib/analytics"

/**
 * Fires a signup that was queued before a full page navigation (signup on the
 * way to Stripe Checkout; see queueSignup in lib/analytics.ts) on the first
 * OneFlyer page the tab loads afterwards. Mounted once in the root layout,
 * and re-checked on every route change, because /checkout's own redirects
 * (to /dashboard or /#pricing) can resolve as a client-side navigation that
 * keeps this layout mounted.
 * StrictMode's double effect is harmless: the queue is emptied on the first
 * run and trackSignup ignores a signup it has already sent.
 */
export function SignupConversion() {
  const pathname = usePathname()
  useEffect(() => {
    flushPendingSignup()
  }, [pathname])
  return null
}
