"use client"

import Link from "next/link"
import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr-fetcher"
import type { OfferRefresh, OfferRefreshItem } from "@/lib/offer-refresh"
import { NewPromotionForm } from "@/components/new-promotion-form"

/**
 * "Time to refresh this offer" (lib/offer-refresh.ts). Basic: a link to the
 * offer page editor. Pro: also a new promotion from that flyer. Each item can
 * be dismissed on this browser; a later end date or another 60 quiet days
 * brings it back (the dismissal is keyed on the date).
 */

const dismissKey = (i: OfferRefreshItem) =>
  `offer-refresh-dismissed:${i.flyerId}:${i.reason}:${i.reason === "expired" ? i.endedOn : i.since}`

function readDismissed(i: OfferRefreshItem): boolean {
  try {
    return localStorage.getItem(dismissKey(i)) === "1"
  } catch {
    return false
  }
}

function formatDate(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
}

export function OfferRefreshBanner({ onCreated }: { onCreated?: () => void }) {
  const { data } = useSWR<OfferRefresh>("/api/account/offer-refresh", fetcher)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const items = (data?.items ?? []).filter((i) => !dismissed.has(dismissKey(i)) && !readDismissed(i))
  if (!items.length) return null

  function dismiss(i: OfferRefreshItem) {
    try {
      localStorage.setItem(dismissKey(i), "1")
    } catch {
      // Hidden for this visit only.
    }
    setDismissed((prev) => new Set(prev).add(dismissKey(i)))
  }

  return (
    <div role="status" className="mt-6 rounded-xl border border-[var(--brand-teal-bright)]/30 bg-[var(--brand-teal-bright)]/5 p-4 text-sm">
      <p className="font-medium">{items.length === 1 ? "An offer could use a refresh" : "Some offers could use a refresh"}</p>
      <ul className="mt-2 flex flex-col gap-3">
        {items.map((i) => (
          <li key={dismissKey(i)}>
            <p className="text-muted-foreground">
              {i.reason === "expired"
                ? <>The offer on <span className="text-foreground">&ldquo;{i.title}&rdquo;</span> ended on {formatDate(i.endedOn)}. Its offer page now tells visitors the offer has ended.</>
                : <>The offer page for <span className="text-foreground">&ldquo;{i.title}&rdquo;</span> hasn&apos;t changed in {i.days} days.</>}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-4 text-xs">
              <Link href={`/dashboard/offer/${i.flyerId}`} className="text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
                Edit offer page
              </Link>
              <button type="button" onClick={() => dismiss(i)} className="text-muted-foreground hover:text-foreground transition-colors">
                Dismiss
              </button>
            </div>
            {data?.canNewPromotion && <NewPromotionForm flyerId={i.flyerId} onCreated={onCreated} />}
          </li>
        ))}
      </ul>
    </div>
  )
}
