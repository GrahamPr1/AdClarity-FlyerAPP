"use client"

import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr-fetcher"
import type { DeliveryNotice } from "@/lib/email-delivery"

/**
 * Shown on the dashboard when a new-lead email to this account bounced
 * (lib/email-delivery.ts). Leads are never lost — they are always on the
 * dashboard — but the owner relies on the email to know one arrived.
 */
export function EmailDeliveryNotice() {
  const { data } = useSWR<{ notice: DeliveryNotice | null }>("/api/account/email-status", fetcher)
  const n = data?.notice
  if (!n) return null
  return (
    <div role="status" className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
      <p className="font-medium">We couldn&apos;t deliver your new-lead email to {n.address}.</p>
      <p className="mt-1 text-muted-foreground">
        {n.type === "temporary"
          ? n.retrying
            ? "Their mail server turned it away for now. We'll try once more within the hour."
            : "Their mail server turned it away for now."
          : "Their mail server refused the address."}{" "}
        Your leads are always listed here on your dashboard. You can check your email settings on your{" "}
        <Link href="/profile#emails" className="text-[var(--brand-teal)] underline">profile</Link>.
      </p>
    </div>
  )
}
