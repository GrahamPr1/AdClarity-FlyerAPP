"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import type { AdminUserDetail, GenerationAgentType } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const AGENT_LABELS: Record<GenerationAgentType, string> = { intake: "Intake", brand: "Brand", flyer: "Flyer", quick_prompt: "Quick Prompt", scrape: "Website Scrape", coloring: "Coloring Page" }

export default function AdminUserDetailPage() {
  const params = useParams<{ email: string }>()
  const email = decodeURIComponent(params.email)

  const { data, error, isLoading } = useSWR<AdminUserDetail & { error?: string }>(
    `/api/admin/users/${encodeURIComponent(email)}`,
    fetcher,
  )

  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-4xl mx-auto">
      <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← All users</Link>

      {isLoading || !data ? (
        <p className="mt-6 text-muted-foreground">Loading…</p>
      ) : data.error ? (
        <p className="mt-6 text-red-400">{data.error}</p>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl tracking-tight">{data.businessName ?? data.email}</h1>
              <p className="text-sm text-muted-foreground">{data.email}{data.isAdmin ? " · admin" : ""}</p>
            </div>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Plan</p>
              <p className="mt-2 text-lg font-semibold capitalize">{data.plan}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Category</p>
              <p className="mt-2 text-lg font-semibold">{data.businessCategory}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Flyers this month</p>
              <p className="mt-2 text-lg font-semibold">{data.flyersCreated} / {data.flyersLimit}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Signed up</p>
              <p className="mt-2 text-lg font-semibold">{data.createdAt ? new Date(data.createdAt).toLocaleDateString() : "—"}</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Estimated AI cost to date</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--brand-teal-bright)]">${data.totalEstimatedCostUsd.toFixed(4)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Summed from {data.generationLog.length} real generation-log rows, not an estimate.</p>
          </div>

          <h2 className="mt-8 text-lg">Generation history</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Flyer</th>
                  <th className="px-4 py-3">Input tokens</th>
                  <th className="px-4 py-3">Output tokens</th>
                  <th className="px-4 py-3">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.generationLog.slice().reverse().map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{AGENT_LABELS[entry.agentType]}</td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.flyerId ?? "—"}</td>
                    <td className="px-4 py-3">{entry.inputTokens.toLocaleString()}</td>
                    <td className="px-4 py-3">{entry.outputTokens.toLocaleString()}</td>
                    <td className="px-4 py-3">${entry.estimatedCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
                {data.generationLog.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No generation activity yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {error && <p className="mt-6 text-red-400">Failed to load this user.</p>}
    </div>
  )
}
