"use client"

import { useState } from "react"
import useSWR from "swr"
import type { FormFillRequest } from "@/lib/types"
import { StatusBadge } from "@/components/dashboard-client"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function FormFillCard({ request }: { request: FormFillRequest }) {
  const ready = request.status === "Ready"
  const failed = request.status === "Failed"

  return (
    <div className="rounded-xl border border-white/10 bg-card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{request.title}</p>
        <div className="mt-1.5"><StatusBadge status={request.status} /></div>
        {failed && request.error && <p className="mt-1.5 text-xs text-red-400/80 leading-snug">{request.error}</p>}
        {request.unfilledNotes && request.unfilledNotes.length > 0 && (
          <ul className="mt-1.5 text-xs text-amber-300/90 leading-snug list-disc list-inside">
            {request.unfilledNotes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
      </div>
      {ready && (
        <a href={`/api/form-fill/download/${request.id}`}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] transition-colors">
          Download
        </a>
      )}
    </div>
  )
}

export function FormFillSection() {
  const [targetForm, setTargetForm] = useState<File | null>(null)
  const [infoFile, setInfoFile] = useState<File | null>(null)
  const [infoLink, setInfoLink] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const { data, mutate } = useSWR<{ requests: FormFillRequest[] }>("/api/form-fill", fetcher, {
    refreshInterval: (latest) => {
      const requests = latest?.requests
      if (!requests) return 4000
      const done = requests.every((r) => r.status === "Ready" || r.status === "Failed")
      return done ? 0 : 4000
    },
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!targetForm) {
      setError("Choose the fillable PDF form to fill out.")
      return
    }
    if (!infoFile && !infoLink.trim()) {
      setError("Provide either an info file or a link with the information to fill it with.")
      return
    }

    setSubmitting(true)
    const body = new FormData()
    body.append("targetForm", targetForm)
    if (infoFile) body.append("infoFile", infoFile)
    if (infoLink.trim()) body.append("infoLink", infoLink.trim())

    const res = await fetch("/api/form-fill", { method: "POST", body })
    setSubmitting(false)

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}) as { message?: string; error?: string })
      setError(resBody.message ?? resBody.error ?? "Could not start the fill — please try again.")
      return
    }

    setTargetForm(null)
    setInfoFile(null)
    setInfoLink("")
    mutate()
  }

  return (
    <div className="mt-12">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Fill a Form</h2>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--brand-amber-tint)] text-[var(--brand-amber)]">Pro</span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">
        Drop in a fillable PDF and a file or link with the information it needs — we&apos;ll fill it out for you.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 rounded-xl border border-white/10 bg-card p-5 flex flex-col gap-4">
        <div>
          <label htmlFor="target-form" className="block text-sm font-medium mb-1.5">Form to fill out (PDF)</label>
          <input id="target-form" type="file" accept="application/pdf" required
            onChange={(e) => setTargetForm(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-muted-foreground" />
        </div>
        <div>
          <label htmlFor="info-file" className="block text-sm font-medium mb-1.5">Info file (PDF or image) — optional if you provide a link</label>
          <input id="info-file" type="file" accept="application/pdf,image/*"
            onChange={(e) => setInfoFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-muted-foreground" />
        </div>
        <div>
          <label htmlFor="info-link" className="block text-sm font-medium mb-1.5">…or a link with the information (a Google Sheet works too)</label>
          <input id="info-link" type="url" placeholder="https://…" value={infoLink}
            onChange={(e) => setInfoLink(e.target.value)}
            className="w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]" />
          <p className="mt-1.5 text-xs text-muted-foreground">For a Google Sheet, set sharing to &quot;Anyone with the link can view&quot; first.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={submitting}
          className="self-start px-5 py-2.5 rounded-lg bg-[var(--brand-teal-bright)] text-white text-sm font-semibold hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors">
          {submitting ? "Uploading…" : "Fill it out"}
        </button>
      </form>

      {data?.requests && data.requests.length > 0 && (
        <div className="mt-5 flex flex-col gap-3">
          {data.requests.map((r) => <FormFillCard key={r.id} request={r} />)}
        </div>
      )}
    </div>
  )
}
