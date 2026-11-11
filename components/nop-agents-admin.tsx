"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import type { AgentRow } from "@/lib/enterprise/portal/admin"
import type { AdminAgentView } from "@/lib/enterprise/portal/store"
import type { AgentFeature, AgentTier } from "@/lib/enterprise/portal/features"
import { NOP_V2_TEMPLATES } from "@/lib/enterprise/nop-render/kit-v2-ids"
import { AdminApprovedText, AdminAgentDataMove, AdminLeadDeletion, AdminRetentionJob } from "@/components/admin-nop-agent-data"
import { AdminEnrollDomain } from "@/components/admin-nop-enroll-domain"
import { AdminNopSignups } from "@/components/admin-nop-signups"
import { AdminNopActivity, AdminProgramAdmins } from "@/components/admin-program-admins"
import { AdminNopEvents } from "@/components/admin-nop-events"
import { AdminNopPrintRequests } from "@/components/admin-nop-print-requests"
import { AdminNopMonthlyEmail } from "@/components/admin-nop-monthly-email"
import { AdminNopSmsOptOuts } from "@/components/admin-nop-sms-optouts"
import { AdminProTrial } from "@/components/admin-pro-trial"

// /admin/enterprise/agents: every agent account, by org; each org's Pro/Leader
// feature switches; and the log of admin views of agent accounts. The admin
// layout gates the page; every route behind it checks admin again.

const fetcher = (url: string) => fetch(url).then((r) => r.json())
type FeaturesResponse = { orgs: { id: string; name: string; features: Record<AgentFeature, boolean> }[]; features: { id: AgentFeature; label: string; tier: AgentTier }[] }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never")
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "")
/** Agent Pro billing, as the agent webhook last recorded it (lib/enterprise/portal/agent-billing.ts). */
const BILLING_LABEL: Record<AgentRow["billing"], (paidUntil: string | null) => string> = {
  paid_pro: (d) => `Paid Pro (renews ${day(d)})`,
  admin_set: () => "Admin-set",
  cancels: (d) => `Cancelled, Pro until ${day(d)}`,
  past_due: () => "Past due",
  cancelled: () => "Cancelled",
  none: () => "—",
}

/**
 * The NOP agents admin screen, for the owner (/admin/enterprise/agents) and
 * for program admins (/program/agents). `role` hides the owner-only parts;
 * every API route checks again on the server.
 */
export function NopAgentsAdmin({ base, role }: { base: string; role: "owner" | "program" }) {
  const agents = useSWR<{ agents: AgentRow[] }>("/api/admin/enterprise/agents", fetcher)
  const features = useSWR<FeaturesResponse>("/api/admin/enterprise/features", fetcher)
  const views = useSWR<{ views: AdminAgentView[] }>("/api/admin/enterprise/agent-views", fetcher)
  const [q, setQ] = useState("")
  const [org, setOrg] = useState("")
  const [tier, setTier] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const flyers = useSWR<{ agentKit: "v1" | "v2"; spanishV2: boolean; agentAreaReady: boolean; log?: { at: string; admin: string; change: Record<string, unknown> }[] }>("/api/admin/enterprise/nop/flyer-settings", fetcher)
  // Switching every agent's flyers is one click too easy to hit by mistake: it asks again first.
  const [confirmV2, setConfirmV2] = useState(false)
  const [flyerMsg, setFlyerMsg] = useState<string | null>(null)
  const [testAgent, setTestAgent] = useState("")
  async function setFlyers(patch: Record<string, unknown>) {
    setFlyerMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/flyer-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
    if (!res.ok) setFlyerMsg((await res.json().catch(() => ({}))).message ?? "Couldn't save.")
    await flyers.mutate()
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (agents.data?.agents ?? []).filter(
      (a) => (!needle || a.name.toLowerCase().includes(needle) || a.email.includes(needle)) && (!org || a.orgId === org) && (!tier || a.tier === tier),
    )
  }, [agents.data, q, org, tier])
  const byOrg = useMemo(() => {
    const m = new Map<string, AgentRow[]>()
    for (const r of rows) m.set(r.orgName, [...(m.get(r.orgName) ?? []), r])
    return [...m.entries()]
  }, [rows])

  async function toggle(orgId: string, feature: AgentFeature, enabled: boolean) {
    setSaving(`${orgId}:${feature}`)
    await fetch("/api/admin/enterprise/features", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, feature, enabled }) })
    await features.mutate()
    setSaving(null)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
      {role === "owner" && <Link href="/admin/enterprise/nop" className="text-sm text-muted-foreground hover:text-foreground">← NOP console</Link>}
      <h1 className="mt-4 text-2xl tracking-tight">Agents</h1>

      <section className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg">Org features</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pro and Leader features each org&apos;s agents can use. Off hides the feature from that org&apos;s agents entirely, on the server too.</p>
        {features.data?.orgs.map((o) => (
          <div key={o.id} className="mt-4">
            <p className="font-medium">{o.name}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {features.data!.features.map((f) => (
                <li key={f.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 text-sm">
                    <input type="checkbox" data-feature={f.id} checked={o.features[f.id]} disabled={saving === `${o.id}:${f.id}`} onChange={(e) => void toggle(o.id, f.id, e.target.checked)} />
                    <span>{f.label}</span>
                    <span className="ml-auto text-xs uppercase text-muted-foreground">{f.tier}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <AdminNopSignups />

      <AdminEnrollDomain />

      <section className="mt-6 rounded-xl border border-border bg-card p-5" data-testid="nop-flyer-settings">
        <h2 className="text-lg">NOP flyers</h2>
        <p className="mt-1 text-sm text-muted-foreground">The Neighborhood Outreach Program&apos;s final flyers (kit v2), with the agent area in the footer as the program approved. Agents get them only once you switch them here.</p>
        {flyers.data && (
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <p>
              Agents get: <strong>{flyers.data.agentKit === "v2" ? "kit v2" : "kit v1.1.1"}</strong>
              {flyers.data.agentKit === "v1" && !confirmV2 && (
                <button type="button" disabled={!flyers.data.agentAreaReady} onClick={() => setConfirmV2(true)} data-testid="switch-v2"
                  className="ml-3 min-h-11 rounded-lg border border-border px-3 disabled:opacity-50" title={flyers.data.agentAreaReady ? undefined : "Needs the agent information area first"}>
                  Switch agents to kit v2
                </button>
              )}
              {flyers.data.agentKit === "v2" && (
                <button type="button" onClick={() => void setFlyers({ agentKit: "v1" })} data-testid="switch-v1"
                  className="ml-3 min-h-11 rounded-lg border border-border px-3">
                  Switch agents back to kit v1.1.1
                </button>
              )}
            </p>
            {flyers.data.agentKit === "v1" && confirmV2 && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                <span>Every agent&apos;s Home and Create will show kit v2 instead of kit v1.1.1. Only do this once a real agent&apos;s enrollment link is confirmed working.</span>
                <button type="button" data-testid="switch-v2-confirm" onClick={() => { setConfirmV2(false); void setFlyers({ agentKit: "v2" }) }} className="min-h-11 rounded-lg border border-border bg-background px-3 font-medium">Yes, switch all agents to kit v2</button>
                <button type="button" onClick={() => setConfirmV2(false)} className="min-h-11 rounded-lg px-3">Cancel</button>
              </div>
            )}
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" data-testid="spanish-v2" checked={flyers.data.spanishV2} onChange={(e) => void setFlyers({ spanishV2: e.target.checked })} />
              Spanish kit-v2 flyers visible to agents (pending the program&apos;s review; keep off)
            </label>
            {flyerMsg && <p role="alert" className="text-red-600">{flyerMsg}</p>}
            {(flyers.data.log?.length ?? 0) > 0 && (
              <details data-testid="flyer-settings-log">
                <summary className="min-h-11 cursor-pointer py-2">Changes ({flyers.data.log!.length})</summary>
                <ul className="mt-1 flex flex-col gap-1">
                  {flyers.data.log!.map((l) => (
                    <li key={l.at}>{new Date(l.at).toLocaleString()}: {Object.entries(l.change).map(([k, v]) => (k === "agentKit" ? `agents → kit ${v === "v2" ? "v2" : "v1.1.1"}` : `Spanish kit v2 ${v ? "on" : "off"}`)).join(", ")} by {l.admin}</li>
                  ))}
                </ul>
              </details>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-2">Preview kit v2 (admin only)</summary>
              <label className="mt-2 block">
                As agent (optional): Agent ID of an active roster agent
                <input value={testAgent} onChange={(e) => setTestAgent(e.target.value.replace(/\D/g, ""))} inputMode="numeric" data-testid="v2-test-agent"
                  className="mt-1 block min-h-11 w-40 rounded-lg border border-border bg-background px-3" />
              </label>
              <p className="mt-1 text-muted-foreground">With an Agent ID, each link is exactly the file that agent would download: their name, phone, enrollment link and QR, after every release check. It&apos;s logged under your account. Without one, the page as the program supplied it.</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {NOP_V2_TEMPLATES.map((id) => (
                  <li key={id} className="flex flex-wrap gap-3">
                    <span className="font-mono text-xs">{id}</span>
                    {(["letter", "bleed"] as const).map((f) => (
                      <a key={f} className="text-[var(--brand-teal-bright)] hover:underline" href={`/api/admin/enterprise/nop/render-check?template=${id}&format=${f}${testAgent ? `&agentId=${testAgent}` : ""}`}>{f}</a>
                    ))}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>

      <AdminApprovedText />
      {role === "owner" && <AdminAgentDataMove />}
      {role === "owner" && <AdminProgramAdmins />}
      {role === "owner" && <AdminProTrial />}
      <AdminNopActivity />
      <AdminLeadDeletion />
      <AdminRetentionJob />

      <section className="mt-8">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Search<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" className="mt-1 block min-h-11 w-64 rounded-lg border border-border bg-background px-3" /></label>
          <label className="text-sm">Org<select value={org} onChange={(e) => setOrg(e.target.value)} className="mt-1 block min-h-11 rounded-lg border border-border bg-background px-3">
            <option value="">All</option>{features.data?.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select></label>
          <label className="text-sm">Tier<select value={tier} onChange={(e) => setTier(e.target.value)} className="mt-1 block min-h-11 rounded-lg border border-border bg-background px-3">
            <option value="">All</option><option value="basic">Basic</option><option value="pro">Pro</option><option value="leader">Leader</option>
          </select></label>
        </div>
        {!agents.data ? <p className="mt-6 text-muted-foreground">Loading…</p> : byOrg.length === 0 ? <p className="mt-6 text-muted-foreground">No agent accounts match.</p> : byOrg.map(([orgName, list]) => (
          <div key={orgName} className="mt-6">
            <h2 className="text-lg">{orgName} <span className="text-sm text-muted-foreground">({list.length})</span></h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm" data-testid="agents-table">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground/70">
                  <th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Agent ID</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Billing</th><th className="px-4 py-3">Last active</th><th className="px-4 py-3">Flyers made</th><th className="px-4 py-3">QR scans</th><th className="px-4 py-3">Leads</th>
                </tr></thead>
                <tbody>{list.map((a) => (
                  <tr key={a.email} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Link href={`${base}/${encodeURIComponent(a.email)}`} className="text-[var(--brand-teal-bright)] hover:underline">{a.name}</Link></td>
                    <td className="px-4 py-3">{a.email}</td><td className="px-4 py-3">{a.agentId}</td><td className="px-4 py-3 capitalize">{a.tier}</td><td className="px-4 py-3 whitespace-nowrap" data-testid="billing-label">{BILLING_LABEL[a.billing](a.paidUntil)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{when(a.lastActive)}</td><td className="px-4 py-3">{a.flyersMade}</td><td className="px-4 py-3">{a.scans}</td><td className="px-4 py-3">{a.leads}</td>
                  </tr>
                ))}</tbody>
                <tfoot><tr className="border-t border-border font-medium" data-testid="org-totals">
                  <td className="px-4 py-3" colSpan={6}>Org totals</td><td className="px-4 py-3">{list.reduce((n, a) => n + a.flyersMade, 0)}</td>
                  <td className="px-4 py-3">{list.reduce((n, a) => n + a.scans, 0)}</td><td className="px-4 py-3">{list.reduce((n, a) => n + a.leads, 0)}</td>
                </tr></tfoot>
              </table>
            </div>
          </div>
        ))}
      </section>

      <AdminNopEvents />
      <AdminNopPrintRequests />
      <AdminNopMonthlyEmail />
      <AdminNopSmsOptOuts />

      <section className="mt-10">
        <h2 className="text-lg">Admin views of agent accounts</h2>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
          {(views.data?.views ?? []).map((v, i) => (
            <li key={i} className="flex flex-wrap gap-x-4 px-4 py-2"><span className="whitespace-nowrap">{when(v.at)}</span><span>{v.admin}</span><span>{v.kind === "view-as" ? "viewed the portal of" : "opened"}</span><span>{v.agentEmail}</span></li>
          ))}
          {views.data && views.data.views.length === 0 && <li className="px-4 py-3 text-muted-foreground">None yet.</li>}
        </ul>
      </section>
    </div>
  )
}
