"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR from "swr"
import type { BillingEventSummary } from "@/lib/types"
import { BILLING_EVENT_LOG_LIMIT } from "@/lib/types"
import { BillingNav, fetcher, money } from "@/components/admin/billing-ui"

export default function BillingActivityPage() {
  const { data, error, isLoading } = useSWR<{ events: BillingEventSummary[] }>("/api/admin/billing/activity", fetcher, { refreshInterval: 15000 })
  const [type, setType] = useState("all")
  const types = useMemo(() => [...new Set((data?.events ?? []).map((e) => e.type))].sort(), [data])
  const events = (data?.events ?? []).filter((e) => type === "all" || e.type === type)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <BillingNav />
      <h1 className="mt-6 text-2xl md:text-3xl tracking-tight">Billing activity</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The last {BILLING_EVENT_LOG_LIMIT} billing events, newest first — one-line summaries, not Stripe payloads.
      </p>

      <label className="mt-6 flex items-center gap-2 text-sm">
        Event type
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-border bg-[var(--surface-soft)] px-3 py-2 text-sm">
          <option value="all">All</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {data && <span className="text-muted-foreground">{events.length} of {data.events.length}</span>}
      </label>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="mt-8 text-sm text-red-400">Couldn&apos;t load billing activity.</p>}

      {data && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Tax</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.eventId ?? "local"}-${i}`} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(e.at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-medium">{e.type}</td>
                  <td className="px-4 py-2 break-all">
                    {e.email ? <Link href={`/admin/billing/members/${encodeURIComponent(e.email)}`} className="hover:text-[var(--brand-teal-bright)]">{e.email}</Link> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 capitalize">{e.plan ?? "—"}</td>
                  <td className="px-4 py-2">{money(e.amount)}</td>
                  <td className="px-4 py-2">{e.tax ? money(e.tax) : "—"}</td>
                  <td className="px-4 py-2">{e.state ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{e.status ?? "—"}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No events.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
