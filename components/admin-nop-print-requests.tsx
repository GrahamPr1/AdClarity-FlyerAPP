"use client"

import { useState } from "react"
import useSWR from "swr"
import type { AdminPrintRequest } from "@/lib/enterprise/portal/print-requests"

// Agents' print requests (owner and program admins). Not orders: quote the
// agent by email, print and ship outside the app, then mark it sent. "Print
// file" is that agent's own flyer, made for the print shop (and logged).

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const button = "min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium disabled:opacity-60"
const when = (iso: string) => new Date(iso).toLocaleDateString()

export function AdminNopPrintRequests() {
  const { data, mutate } = useSWR<{ requests: AdminPrintRequest[] }>("/api/admin/enterprise/nop/print-requests", fetcher)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  async function mark(r: AdminPrintRequest, status: "Fulfilled" | "Cancelled") {
    setBusy(r.id); setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/print-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: r.email, id: r.id, status }) })
    setBusy(null)
    if (!res.ok) setMsg("Couldn't save.")
    await mutate()
  }
  const open = (data?.requests ?? []).filter((r) => r.status === "Requested").length
  return (
    <section className="mt-8" data-testid="admin-print-requests">
      <h2 className="text-lg">Print requests {open > 0 && <span className="text-sm text-muted-foreground">({open} open)</span>}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Not orders: nothing has been charged. Email the agent a quote, print and ship it, then mark it sent. Both are logged.</p>
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
      {!data ? <p className="mt-3 text-muted-foreground">Loading…</p> : data.requests.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No print requests yet.</p> : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
          {data.requests.map((r) => (
            <li key={r.id} data-testid="admin-print-request" data-status={r.status} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <span>
                <span className="font-medium">{r.agentName}</span> <span className="text-muted-foreground">(Agent ID {r.agentId}, {r.email})</span>
                <span className="block">{r.flyerTitle} · {r.quantity} copies · requested {when(r.createdAt)}</span>
                <span className="block whitespace-pre-wrap text-muted-foreground">Ship to: {r.shippingName}, {r.shippingAddress}</span>
                {r.notes && <span className="block whitespace-pre-wrap text-muted-foreground">Notes: {r.notes}</span>}
                <span className="block font-medium" data-testid="admin-print-status">{r.status === "Requested" ? "Open" : r.status === "Fulfilled" ? "Sent" : "Cancelled"}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                <a className={button + " inline-flex items-center"} href={`/api/admin/enterprise/nop/print-requests/file?email=${encodeURIComponent(r.email)}&id=${encodeURIComponent(r.id)}`} data-testid="admin-print-file">Print file</a>
                {r.status === "Requested" && <>
                  <button type="button" className={button} disabled={busy === r.id} onClick={() => void mark(r, "Fulfilled")} data-testid="admin-print-fulfilled">Mark sent</button>
                  <button type="button" className={button} disabled={busy === r.id} onClick={() => void mark(r, "Cancelled")}>Cancel</button>
                </>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
