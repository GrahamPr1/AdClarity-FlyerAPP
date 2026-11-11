"use client"

import { useState } from "react"
import useSWR from "swr"
import type { FollowUpRun } from "@/lib/enterprise/portal/followup-reminders"

// The daily follow-up reminder (owner and program admins): what the last runs
// did, and a dry run on demand. Admins never send it; the daily job does, only
// where the org switch is on ("Daily follow-up reminder email" above).

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const when = (iso: string) => new Date(iso).toLocaleString()

export function AdminNopFollowUpReminders() {
  const { data, mutate } = useSWR<{ runs: FollowUpRun[] }>("/api/admin/enterprise/nop/followup-reminders", fetcher)
  const [busy, setBusy] = useState(false)
  async function dryRun() {
    setBusy(true)
    const res = await fetch("/api/admin/enterprise/nop/followup-reminders", { method: "POST" })
    if (res.ok) await mutate(await res.json(), { revalidate: false })
    setBusy(false)
  }
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="admin-followup-reminders">
      <h2 className="text-lg">Daily follow-up reminder</h2>
      <p className="mt-1 text-muted-foreground">
        Every morning, active Pro and Leader agents get one email listing the leads that need follow-up today (a follow-up date today or earlier, or New and untouched for 2+ days), each linking to the lead.
        Only while the org switch is on; nothing is sent when nothing is due; never twice a day; agents can turn it off in their profile.
      </p>
      <button type="button" disabled={busy} onClick={() => void dryRun()} className="mt-3 min-h-11 rounded-lg border border-border px-3 disabled:opacity-50" data-testid="followup-dry-run">
        {busy ? "Checking…" : "Dry run: who would get it today"}
      </button>
      {data && data.runs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1" data-testid="followup-runs">
          {data.runs.map((r) => (
            <li key={r.at}>
              {when(r.at)} · {r.mode === "live" ? "sent" : "dry run"} by {r.by} for {r.day}: {r.withLeads} with leads due{r.mode === "live" ? `, ${r.sent} sent, ${r.already} already sent, ${r.failed} failed` : ", nothing sent"} · {r.nothingDue} nothing due · {r.optedOut} turned it off
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
