"use client"

import { useState } from "react"
import useSWR from "swr"
import type { MonthlyRun } from "@/lib/enterprise/portal/monthly-email"

// The monthly results email (owner and program admins): what the last runs did,
// and a dry run on demand. Admins never send it; the monthly job does, only to
// agents whose org has it switched on ("Monthly results email" above).

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const when = (iso: string) => new Date(iso).toLocaleString()

export function AdminNopMonthlyEmail() {
  const { data, mutate } = useSWR<{ runs: MonthlyRun[] }>("/api/admin/enterprise/nop/monthly-email", fetcher)
  const [busy, setBusy] = useState(false)
  async function dryRun() {
    setBusy(true)
    const res = await fetch("/api/admin/enterprise/nop/monthly-email", { method: "POST" })
    if (res.ok) await mutate(await res.json(), { revalidate: false })
    setBusy(false)
  }
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="admin-monthly-email">
      <h2 className="text-lg">Monthly results email</h2>
      <p className="mt-1 text-muted-foreground">
        On the 1st of each month, active Pro and Leader agents get last month&apos;s scans, leads, RSVPs and new sign-ups through their link, in their language, with one link to OneFlyer.
        Only while the org switch is on; never twice in a month; agents can turn it off in their profile; nothing is sent for a month with nothing to report.
      </p>
      <button type="button" disabled={busy} onClick={() => void dryRun()} className="mt-3 min-h-11 rounded-lg border border-border px-3 disabled:opacity-50" data-testid="monthly-dry-run">
        {busy ? "Checking…" : "Dry run: who would get it"}
      </button>
      {data && data.runs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1" data-testid="monthly-runs">
          {data.runs.map((r) => (
            <li key={r.at}>
              {when(r.at)} · {r.mode === "live" ? "sent" : "dry run"} by {r.by} for {r.month}: {r.eligible} would get it{r.mode === "live" ? `, ${r.sent} sent, ${r.already} already sent, ${r.failed} failed` : ", nothing sent"} · {r.optedOut} turned it off · {r.nothingToReport} nothing to report
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
