"use client"

import { useEffect, useState } from "react"

// The agent's flyers, from /api/ap/{slug}/flyers (the org's approved version,
// or PROOFs while there is none). Each card is a render with the agent's own
// name, phone, link and QR; downloads are Letter and print-shop bleed PDFs.

type Flyer = { id: string; layout: string; lang: string; pricing: string; label: string }

export function ApFlyers({ slug, labels }: { slug: string; labels: { pending: string; proof: string; letter: string; bleed: string; withPrices: string; noPrices: string } }) {
  const [data, setData] = useState<{ proof: boolean; flyers: Flyer[] } | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    fetch(`/api/ap/${slug}/flyers`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError(true))
  }, [slug])
  if (error) return <p className="text-sm text-destructive">Couldn&apos;t load your flyers.</p>
  if (!data) return <p className="text-sm text-muted-foreground">…</p>
  if (data.flyers.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{labels.pending}</p>
  const base = `/api/ap/${slug}/flyers`
  return (
    <div className="mt-3 space-y-3">
      {data.proof && <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800" data-testid="ap-proof-note">{labels.proof}</p>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" data-testid="ap-flyers">
        {data.flyers.map((f) => (
          <figure key={f.id} className="space-y-1" data-flyer-id={f.id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendered by our own API with this agent's details */}
            <img src={`${base}/${f.id}?size=letter&format=thumb`} alt={f.label} loading="lazy" className="w-full rounded border" />
            <figcaption className="text-xs">
              <div className="font-medium">{f.label}</div>
              <div className="text-muted-foreground">{f.lang.toUpperCase()} · {f.pricing === "price" ? labels.withPrices : labels.noPrices}</div>
              <a className="underline" href={`${base}/${f.id}?size=letter&format=pdf`}>{labels.letter}</a> · <a className="underline" href={`${base}/${f.id}?size=bleed&format=pdf`}>{labels.bleed}</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
