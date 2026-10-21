"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR from "swr"
import type { BillingMemberRow } from "@/lib/billing-admin"
import { BillingNav, PLAN_LABELS, StatusText, date, fetcher } from "@/components/admin/billing-ui"

type SortKey = "email" | "plan" | "interval" | "status" | "billingState" | "renewalDate" | "flyersCreated" | "paidSince" | "failedPaymentCount"

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "plan", label: "Plan" },
  { key: "interval", label: "Interval" },
  { key: "status", label: "Status" },
  { key: "billingState", label: "State" },
  { key: "renewalDate", label: "Renews" },
  { key: "flyersCreated", label: "Usage" },
  { key: "paidSince", label: "Paid since" },
  { key: "failedPaymentCount", label: "Failed" },
]

function sortRows(rows: BillingMemberRow[], key: SortKey, dir: 1 | -1) {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? ""
    const bv = b[key] ?? ""
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
}

export default function BillingMembersPage() {
  const { data, error, isLoading } = useSWR<{ members: BillingMemberRow[] }>("/api/admin/billing/members", fetcher, { refreshInterval: 30000 })
  const [status, setStatus] = useState("all")
  const [plan, setPlan] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("renewalDate")
  const [sortDir, setSortDir] = useState<1 | -1>(1)

  const statuses = useMemo(() => [...new Set((data?.members ?? []).map((m) => m.status))].sort(), [data])
  const rows = useMemo(() => {
    const filtered = (data?.members ?? []).filter((m) => (status === "all" || m.status === status) && (plan === "all" || m.plan === plan))
    return sortRows(filtered, sortKey, sortDir)
  }, [data, status, plan, sortKey, sortDir])

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  const select = "rounded-lg border border-border bg-[var(--surface-soft)] px-3 py-2 text-sm"

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      <BillingNav />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl tracking-tight">Members</h1>
        {/* A file download from an API route, not page navigation — a plain
            link lets the browser handle Content-Disposition (same as the
            waitlist export). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/api/admin/billing/members?format=csv" className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]">
          Export CSV
        </a>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
            <option value="all">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={select}>
            <option value="all">All</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="trial">Free Trial</option>
          </select>
        </label>
        {data && <span className="self-center text-sm text-muted-foreground">{rows.length} of {data.members.length}</span>}
      </div>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading members…</p>}
      {error && <p className="mt-8 text-sm text-red-400">Couldn&apos;t load members.</p>}

      {data && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-medium" aria-sort={sortKey === c.key ? (sortDir === 1 ? "ascending" : "descending") : undefined}>
                    <button onClick={() => sortBy(c.key)} className="flex items-center gap-1 transition-colors hover:text-foreground">
                      {c.label} {sortKey === c.key && (sortDir === 1 ? "↑" : "↓")}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.email} className="border-b border-border last:border-0 transition-colors hover:bg-[var(--surface-sunken)]">
                  <td className="px-4 py-3 break-all">
                    <Link href={`/admin/billing/members/${encodeURIComponent(m.email)}`} className="hover:text-[var(--brand-teal-bright)]">{m.email}</Link>
                  </td>
                  <td className="px-4 py-3">{PLAN_LABELS[m.plan]}</td>
                  <td className="px-4 py-3 capitalize">{m.interval ?? "—"}</td>
                  <td className="px-4 py-3"><StatusText status={m.status} /></td>
                  <td className="px-4 py-3">{m.billingState ?? "—"}</td>
                  <td className="px-4 py-3">
                    {date(m.renewalDate)}
                    {m.cancelAtPeriodEnd && <span className="block text-xs text-amber-700 dark:text-amber-300">ends — not renewing</span>}
                  </td>
                  <td className="px-4 py-3">{m.flyersCreated} / {m.flyersLimit}</td>
                  <td className="px-4 py-3">{date(m.paidSince)}</td>
                  <td className="px-4 py-3">{m.failedPaymentCount || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-muted-foreground">No members match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
