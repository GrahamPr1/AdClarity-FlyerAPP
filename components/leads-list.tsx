"use client"

import { useState } from "react"
import type { LeadRecord } from "@/lib/types"

/**
 * Offer-page leads, newest first, with contact details and a single delete
 * behind an inline confirm (no browser dialog). Used on a flyer card for the
 * owner, and on the admin user page.
 */
export function LeadsList({
  leads,
  onDelete,
  flyerTitles,
}: {
  leads: LeadRecord[]
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>
  /** Admin view: which flyer each lead came from. */
  flyerTitles?: Record<string, string>
}) {
  if (leads.length === 0) return <p className="text-xs text-muted-foreground">No leads yet. They appear here as soon as someone fills in the form on your offer page.</p>
  return (
    <ul className="divide-y divide-border">
      {leads.map((lead) => (
        <LeadRow key={lead.id} lead={lead} onDelete={onDelete} flyerTitle={flyerTitles?.[lead.flyerId]} />
      ))}
    </ul>
  )
}

function LeadRow({ lead, onDelete, flyerTitle }: { lead: LeadRecord; onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>; flyerTitle?: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setDeleting(true)
    setError(null)
    const res = await onDelete(lead.id)
    if (!res.ok) {
      setError(res.error ?? "That didn't delete. Try again.")
      setDeleting(false)
    }
  }

  return (
    <li className="py-3 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{lead.name}</p>
        <time dateTime={lead.createdAt} className="shrink-0 text-muted-foreground">
          {new Date(lead.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
        </time>
      </div>
      {lead.afterOfferEnded && <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">Came in after this offer ended.</p>}
      {flyerTitle && <p className="mt-1 text-muted-foreground">From: {flyerTitle}</p>}
      <p className="mt-1">
        <a href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`} className="text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">{lead.phone}</a>
        {lead.email && (
          <>
            {" · "}
            <a href={`mailto:${lead.email}`} className="break-all text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">{lead.email}</a>
          </>
        )}
      </p>
      {lead.message && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{lead.message}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <span className="text-foreground">Delete this lead? This can&apos;t be undone.</span>
            <button type="button" onClick={() => void remove()} disabled={deleting}
              className="min-h-8 rounded-md bg-[var(--destructive)] px-3 font-semibold text-white disabled:opacity-50">
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={deleting} className="min-h-8 px-1 text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="min-h-8 text-muted-foreground hover:text-foreground">
            Delete
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-red-600 dark:text-red-400">{error}</p>}
    </li>
  )
}
