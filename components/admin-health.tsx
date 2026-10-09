"use client"

import useSWR from "swr"
import type { HealthRun } from "@/lib/health/run"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/** The daily health check's recent runs (site owner's admin page). */
export function AdminHealthPanel() {
  const { data } = useSWR<{ runs: HealthRun[]; hoursSinceLast: number | null }>("/api/admin/health", fetcher, { revalidateOnFocus: false })
  const runs = data?.runs ?? []
  const last = runs[0]
  const hoursSince = data?.hoursSinceLast ?? null
  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-5" data-testid="health-panel">
      <h2 className="text-lg">Daily health check</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every day at about 11:00 UTC: one NOP flyer and one business PDF through the production routes. Failures are emailed at once; a summary goes out on Mondays.
      </p>
      {!data && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {data && !last && <p className="mt-3 text-sm text-muted-foreground">No runs yet.</p>}
      {last && (
        <p className={`mt-3 text-sm font-medium ${last.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
          Last run {new Date(last.at).toLocaleString()}: {last.ok ? "passed" : "FAILED"}
          {hoursSince !== null && hoursSince > 30 && <span className="text-red-700 dark:text-red-400"> — {hoursSince} hours ago, so a daily run was missed</span>}
        </p>
      )}
      {runs.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {runs.map((r) => (
            <li key={r.at} className="border-t border-border pt-2">
              <span className="text-muted-foreground">{new Date(r.at).toLocaleString()}</span> — {r.ok ? "passed" : "FAILED"}
              {r.alert && <span className="text-muted-foreground"> · {r.alert.kind} email {r.alert.sent ? "sent" : `not sent (${r.alert.reason})`}</span>}
              {r.checks.map((c) => (
                <div key={c.name} className={`text-xs ${c.ok ? "text-muted-foreground" : "text-red-700 dark:text-red-400"}`}>{c.name}: {c.detail} ({c.ms} ms)</div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
