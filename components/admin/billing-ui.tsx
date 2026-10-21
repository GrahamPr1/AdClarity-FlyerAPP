"use client"

import Link from "next/link"
import type { PlanId } from "@/lib/types"

// Small shared pieces for the /admin/billing pages, styled like the existing
// admin pages (StatCard in /admin/users, Stat in /admin/waitlist).

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export const PLAN_LABELS: Record<PlanId, string> = { trial: "Free Trial", basic: "Basic", pro: "Pro" }

export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—"
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`
}

export function date(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : "—"
}

export function StatCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  active: "text-emerald-700 dark:text-emerald-300",
  past_due: "text-red-700 dark:text-red-300",
  unpaid: "text-red-700 dark:text-red-300",
  paused: "text-amber-700 dark:text-amber-300",
  canceled: "text-muted-foreground",
}

export function StatusText({ status }: { status: string }) {
  return <span className={STATUS_STYLES[status] ?? "text-muted-foreground"}>{status.replace(/_/g, " ")}</span>
}

export function BillingNav() {
  const links = [
    ["/admin", "Overview"],
    ["/admin/billing/members", "Members"],
    ["/admin/billing/activity", "Billing activity"],
    ["/admin/billing/audit", "Free-Pro audit"],
  ] as const
  return (
    <nav aria-label="Billing" className="flex flex-wrap gap-4 text-sm">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="text-[var(--brand-teal-bright)] transition-colors hover:text-[var(--brand-teal)]">
          {label}
        </Link>
      ))}
    </nav>
  )
}
