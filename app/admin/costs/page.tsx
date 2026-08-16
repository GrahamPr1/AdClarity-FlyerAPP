"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { AdminCostsOverview, GenerationAgentType, PlanId } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PLAN_LABELS: Record<PlanId, string> = { trial: "Free Trial", basic: "Basic", pro: "Pro" }
const AGENT_LABELS: Record<GenerationAgentType, string> = { intake: "Intake", brand: "Brand", flyer: "Flyer" }
const PLAN_FILTER_OPTIONS = ["All", "trial", "basic", "pro"] as const

function fmt(cost: number): string {
  return `$${cost.toFixed(4)}`
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  )
}

export default function AdminCostsPage() {
  const { data, isLoading } = useSWR<AdminCostsOverview>("/api/admin/costs", fetcher, { refreshInterval: 30000 })
  const [planFilter, setPlanFilter] = useState<(typeof PLAN_FILTER_OPTIONS)[number]>("All")

  const filteredUsers = useMemo(() => {
    if (!data) return []
    return planFilter === "All" ? data.topCostUsers : data.topCostUsers.filter((u) => u.plan === planFilter)
  }, [data, planFilter])

  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">AI Cost Tracking</h1>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Admin home</Link>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Real figures from every logged Intake/Brand/Flyer API call — nothing here is estimated.
      </p>

      {isLoading || !data ? (
        <p className="mt-8 text-muted-foreground">Loading cost data…</p>
      ) : (
        <>
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
            <StatCard label="Spend today" value={fmt(data.totalCostTodayUsd)} />
            <StatCard label="Spend this week" value={fmt(data.totalCostThisWeekUsd)} />
            <StatCard label="Spend this month" value={fmt(data.totalCostThisMonthUsd)} />
          </div>

          <div className="mt-6 rounded-xl border border-white/10 bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Spend — last 30 days</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.costTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "currentColor" }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "currentColor" }} width={50} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)" }} formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="cost" stroke="var(--brand-teal-bright)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Avg cost per flyer generation</p>
              <p className="mt-2 text-2xl font-semibold">{fmt(data.averageCostPerFlyerGenerationUsd)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Average of one Flyer Agent call, last 30 days.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Cost by pipeline stage (last 30 days)</p>
              <div className="mt-3 flex flex-col gap-2">
                {(Object.entries(data.costByAgentType) as [GenerationAgentType, number][]).map(([stage, cost]) => (
                  <div key={stage} className="flex items-center justify-between text-sm">
                    <span>{AGENT_LABELS[stage]}</span>
                    <span className="text-muted-foreground">{fmt(cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Top 20 highest-cost users this month</h2>
            <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value as (typeof PLAN_FILTER_OPTIONS)[number])}
              className="rounded-lg bg-white/[0.04] border border-white/12 px-3 py-1.5 text-sm">
              {PLAN_FILTER_OPTIONS.map((p) => (
                <option key={p} value={p} className="bg-card">{p === "All" ? "All plans" : PLAN_LABELS[p as PlanId]}</option>
              ))}
            </select>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Cost this month</th>
                  <th className="px-4 py-3">Plan average</th>
                  <th className="px-4 py-3">Flag</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.email} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${encodeURIComponent(u.email)}`} className="hover:text-[var(--brand-teal-bright)] transition-colors">
                        <div className="font-medium">{u.businessName ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{PLAN_LABELS[u.plan]}</td>
                    <td className="px-4 py-3 font-medium">{fmt(u.monthlyCostUsd)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(u.planAverageCostUsd)}</td>
                    <td className="px-4 py-3">
                      {u.isOutlier && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/40">
                          Outlier — 3x+ plan avg
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No users match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
