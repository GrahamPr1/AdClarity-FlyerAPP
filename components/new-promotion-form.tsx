"use client"

import { useState } from "react"

/**
 * Pro: one new flyer from an existing one, with a new offer and the same
 * design. The source is looked up when the form opens: flyers made before
 * per-campaign inputs were saved take their business details from the
 * Business Profile instead, and the form says so before anything is generated. /api/campaigns/new-promotion enforces the plan gate.
 */
export function NewPromotionForm({ flyerId, onCreated }: { flyerId: string; onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<"campaign" | "profile" | null>(null)
  const [offer, setOffer] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    setError("")
    if (next && !source) {
      const res = await fetch(`/api/campaigns/new-promotion?flyerId=${encodeURIComponent(flyerId)}`).catch(() => null)
      const body = res?.ok ? await res.json().catch(() => null) : null
      if (body?.source === "campaign" || body?.source === "profile") setSource(body.source)
      else setError(body?.message ?? "This isn't available for this flyer right now.")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!offer.trim()) {
      setError("Say what the new promotion is.")
      return
    }
    setSubmitting(true)
    const res = await fetch("/api/campaigns/new-promotion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flyerId, offer: offer.trim(), notes: notes.trim() }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => null) : null
    setSubmitting(false)
    if (!res?.ok) {
      setError(body?.message ?? "Could not start the new flyer — please try again.")
      return
    }
    setSubmitted(true)
    setOpen(false)
    setOffer("")
    setNotes("")
    onCreated?.()
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button onClick={() => void toggle()}
        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
        {open ? "Cancel new promotion ▲" : "New promotion from this campaign ▼"}
      </button>
      {submitted && !open && <p className="mt-2 text-xs text-[var(--brand-teal-bright)]">Your new flyer is being made — it will appear in your list shortly.</p>}
      {open && (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2.5">
          {source === "campaign" && (
            <p className="rounded-lg border border-border bg-[var(--surface-soft)] px-3 py-2 text-xs text-muted-foreground">
              Uses this flyer&apos;s business details, photos, format and design (layout, colours and fonts).
              Only the offer changes.
              It counts as one flyer on your plan.
            </p>
          )}
          {source === "profile" && (
            <p className="rounded-lg border border-border bg-[var(--surface-soft)] px-3 py-2 text-xs text-muted-foreground">
              The new flyer keeps this flyer&apos;s design: its layout, colours and fonts. This flyer was
              made before OneFlyer kept what each campaign was made from, so the business details come from
              your saved Business Profile, and its photos aren&apos;t carried over. It counts as one flyer on
              your plan.
            </p>
          )}
          <div>
            <label htmlFor={`np-offer-${flyerId}`} className="block text-xs font-medium mb-1">New promotion</label>
            <input id={`np-offer-${flyerId}`} type="text" value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={300}
              placeholder="What you're offering this time"
              className="w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)]" />
          </div>
          <div>
            <label htmlFor={`np-notes-${flyerId}`} className="block text-xs font-medium mb-1">Details (optional)</label>
            <textarea id={`np-notes-${flyerId}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000}
              placeholder="Dates, conditions, anything that must appear"
              className="w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)]" />
          </div>
          {error && <p role="alert" className="text-xs text-[var(--destructive)]">{error}</p>}
          <button type="submit" disabled={submitting || !source}
            className="self-start mt-1 px-4 py-2 rounded-lg bg-[var(--brand-teal-bright)] text-[var(--primary-foreground)] text-xs font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
            {submitting ? "Starting…" : "Make the new flyer"}
          </button>
        </form>
      )}
    </div>
  )
}
