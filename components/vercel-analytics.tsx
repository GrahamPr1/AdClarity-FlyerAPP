"use client"

import { Analytics } from "@vercel/analytics/next"
import { usePathname } from "next/navigation"
import { isOfferPagePath } from "@/lib/offer-page"

/** Vercel Web Analytics everywhere except offer pages (see isOfferPagePath). */
export function VercelAnalytics() {
  const pathname = usePathname()
  if (isOfferPagePath(pathname)) return null
  return <Analytics />
}
