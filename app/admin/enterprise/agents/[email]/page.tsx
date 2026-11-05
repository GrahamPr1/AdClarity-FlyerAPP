"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import type { AgentDetail } from "@/lib/enterprise/portal/admin"
import { AGENT_TIERS, type AgentTier } from "@/lib/enterprise/portal/features"

// /admin/enterprise/agents/{email}: one agent's account. Opening it is logged.
const fetcher = (url: string) => fetch(url).then((r) => r.json())
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never")

export default function AdminAgentPage() {
  const email = decodeURIComponent(useParams<{ email: string }>().email)
  const router = useRouter()
  const { data, mutate } = useSWR<AgentDetail & { error?: string }>(`/api/admin/enterprise/agents/${encodeURIComponent(email)}`, fetcher, { revalidateOnFocus: false })
  const [tier, setTier] = useState<AgentTier | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return <p className="px-10 py-10 text-muted-foreground">Loading…</p>
  if (data.error) return <p className="px-10 py-10 text-red-500">{data.error}</p>
  const current = tier ?? data.tier
  const row = (label: string, value: string | number) => (
    <div className="flex justify-between gap-4 border-t border-border py-2 first:border-t-0"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>
  )

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/admin/enterprise/agents" className="text-sm text-muted-foreground hover:text-foreground">← All agents</Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl tracking-tight">{data.name}</h1><p className="text-sm text-muted-foreground">{data.email} · {data.orgName}</p></div>
        <button type="button" data-testid="view-as" disabled={busy}
          onClick={async () => {
            setBusy(true)
            const res = await fetch("/api/admin/enterprise/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.email }) })
            if (res.ok) { router.push("/agent"); router.refresh() }
            else { setBusy(false); setMsg("Couldn't open the agent's portal.") }
          }}
          className="min-h-11 rounded-lg bg-[var(--brand-teal-bright)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60">
          View as agent (read-only)
        </button>
      </div>

      <dl className="mt-6 rounded-xl border border-border bg-card p-5 text-sm">
        {row("Agent ID", data.agentId)}{row("Company", data.companyName || "—")}{row("Phone", data.phone || "—")}{row("Roster status", data.status)}
        {row("Recruiter", "—")}{row("Team", "—")}{row("Last active", when(data.lastActive))}{row("Flyers made", data.flyersMade)}{row("Leads", data.leads)}
      </dl>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-medium">Tier</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select data-testid="tier-select" value={current} onChange={(e) => setTier(e.target.value as AgentTier)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm capitalize">
            {AGENT_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" data-testid="tier-save" disabled={busy || current === data.tier}
            onClick={async () => {
              setBusy(true); setMsg(null)
              const res = await fetch(`/api/admin/enterprise/agents/${encodeURIComponent(data.email)}/tier`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: current }) })
              setBusy(false)
              setMsg(res.ok ? `Tier set to ${current}.` : "Couldn't change the tier.")
              if (res.ok) { setTier(null); void mutate() }
            }}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50">Save tier</button>
          {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Recent activity</h2>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
          {data.recentActivity.map((e, i) => <li key={i} className="flex flex-wrap gap-x-4 px-4 py-2"><span className="whitespace-nowrap">{when(e.at)}</span><span>{e.template}</span><span>{e.format}</span></li>)}
          {data.recentActivity.length === 0 && <li className="px-4 py-3 text-muted-foreground">No flyers yet.</li>}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Admin views of this account</h2>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
          {data.views.map((v, i) => <li key={i} className="flex flex-wrap gap-x-4 px-4 py-2"><span className="whitespace-nowrap">{when(v.at)}</span><span>{v.admin}</span><span>{v.kind === "view-as" ? "viewed the portal" : "opened the account"}</span></li>)}
        </ul>
      </section>
    </div>
  )
}
