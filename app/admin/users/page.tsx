"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { AdminUserRow, AdminUsersOverview, PlanId, BusinessCategory } from "@/lib/types"
import { BUSINESS_CATEGORIES } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLAN_LABELS: Record<PlanId, string> = { trial: "Free Trial", basic: "Basic", pro: "Pro" }

type SortKey = "businessName" | "plan" | "businessCategory" | "createdAt" | "flyersCreated" | "status"

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function BreakdownList({ title, counts, labels }: { title: string; counts: Record<string, number>; labels?: Record<string, string> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{title}</p>
      <div className="mt-3 flex flex-col gap-2">
        {Object.entries(counts).map(([key, count]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <span>{labels?.[key] ?? key}</span>
            <span className="text-muted-foreground">{count} {total > 0 ? `(${Math.round((count / total) * 100)}%)` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function sortUsers(users: AdminUserRow[], key: SortKey, dir: 1 | -1): AdminUserRow[] {
  return [...users].sort((a, b) => {
    const av = key === "businessName" ? (a.businessName ?? a.email) : a[key] ?? ""
    const bv = key === "businessName" ? (b.businessName ?? b.email) : b[key] ?? ""
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
}

/**
 * Hoisted out of the parent component body. Defined inline, this was a new
 * component identity on every render, so React unmounted and remounted all
 * six headers whenever any sort state changed — losing focus and defeating
 * reconciliation. Takes the sort state as props instead of closing over it.
 */
function SortHeader({
  label,
  sortField,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  sortField: SortKey
  sortKey: SortKey
  sortDir: 1 | -1
  onSort: (key: SortKey) => void
}) {
  return (
    <button onClick={() => onSort(sortField)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label} {sortKey === sortField && (sortDir === 1 ? "↑" : "↓")}
    </button>
  )
}

export default function AdminUsersPage() {
  const { data, isLoading } = useSWR<AdminUsersOverview>("/api/admin/users", fetcher, { refreshInterval: 30000 })
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const filteredSorted = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const filtered = q
      ? data.users.filter((u) => u.email.toLowerCase().includes(q) || (u.businessName ?? "").toLowerCase().includes(q))
      : data.users
    return sortUsers(filtered, sortKey, sortDir)
  }, [data, search, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortKey(key)
      setSortDir(1)
    }
  }


  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Users</h1>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Admin home</Link>
      </div>

      {isLoading || !data ? (
        <p className="mt-8 text-muted-foreground">Loading users…</p>
      ) : (
        <>
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
            <StatCard label="Total users" value={data.totalUsers} />
            <StatCard label="New signups this week" value={data.newSignupsThisWeek} />
            <StatCard label="New signups this month" value={data.newSignupsThisMonth} />
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Signups — last 30 days</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.signupTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "currentColor" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "currentColor" }} width={24} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }} />
                  <Line type="monotone" dataKey="count" stroke="var(--brand-teal-bright)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <BreakdownList title="By plan" counts={data.byPlan} labels={PLAN_LABELS} />
            <BreakdownList
              title="By business category"
              counts={data.byCategory}
              labels={Object.fromEntries(BUSINESS_CATEGORIES.map((c) => [c, c])) as Record<BusinessCategory, string>}
            />
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">All users</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-64 rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2 text-sm focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)]"
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                  <th className="px-4 py-3"><SortHeader label="Name / Email" sortField="businessName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                  <th className="px-4 py-3"><SortHeader label="Plan" sortField="plan" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                  <th className="px-4 py-3"><SortHeader label="Category" sortField="businessCategory" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                  <th className="px-4 py-3"><SortHeader label="Signed up" sortField="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                  <th className="px-4 py-3"><SortHeader label="Flyers this month" sortField="flyersCreated" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                  <th className="px-4 py-3"><SortHeader label="Status" sortField="status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} /></th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((u) => (
                  <tr key={u.email} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${encodeURIComponent(u.email)}`} className="hover:text-[var(--brand-teal-bright)] transition-colors">
                        <div className="font-medium">{u.businessName ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}{u.isAdmin ? " · admin" : ""}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{PLAN_LABELS[u.plan]}</td>
                    <td className="px-4 py-3">{u.businessCategory}</td>
                    <td className="px-4 py-3">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">{u.flyersCreated} / {u.flyersLimit}</td>
                    <td className="px-4 py-3 capitalize">{u.status}</td>
                  </tr>
                ))}
                {filteredSorted.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No users match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
