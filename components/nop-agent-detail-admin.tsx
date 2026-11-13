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

/** One agent's admin page, for the owner and for program admins (`base` is the list it belongs to). */
export function NopAgentDetailAdmin({ base }: { base: string }) {
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
      <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">← All agents</Link>
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
        {row("Recruited by", data.recruiter ? `${data.recruiter.name || "—"} (Agent ID ${data.recruiter.agentId})` : "—")}{row("Recruits", data.recruits.length)}{row("Team", "—")}{row("Last active", when(data.lastActive))}{row("Flyers made", data.flyersMade)}{row("Leads", data.leads)}
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

      <ProgramMembership data={data} onChange={() => void mutate()} />
      <DeleteAccount agentId={data.agentId} base={base} />

      {data.recruits.length > 0 && (
        <section className="mt-6" data-testid="admin-recruits">
          <h2 className="font-medium">Recruits</h2>
          <p className="text-sm text-muted-foreground">Agents who signed up through this agent&apos;s recruit link.</p>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
            {data.recruits.map((r) => (
              <li key={r.agentId} className="flex flex-wrap gap-x-4 px-4 py-2">
                <span>{r.name}</span><span className="text-muted-foreground">Agent ID {r.agentId}</span>
                <span className="capitalize">{r.status === "pending" ? "Waiting for approval" : r.status === "approved" ? "Approved" : "No longer active"}</span>
                <span className="text-muted-foreground">signed up {when(r.signedUpAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

/**
 * Remove from program (terminated: no sign-in, no flyers or Pro features, QR to the
 * program's page, and the 12-month lead deletion clock starts) and its Undo. Logged.
 */
const money = (cents: number, currency: string | null) => new Intl.NumberFormat("en-US", { style: "currency", currency: (currency ?? "usd").toUpperCase() }).format(cents / 100)

function ProgramMembership({ data, onChange }: { data: AgentDetail; onChange: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—")
  async function act(action: "remove" | "reactivate") {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/admin/enterprise/agents/${encodeURIComponent(data.email)}/program`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    setConfirm(false)
    const b = body.billing as { cancelled: boolean; refunded: number; currency: string | null; error?: string } | undefined
    const billingNote = b?.error ? ` Their Pro subscription couldn't be cancelled (${b.error}): cancel and refund it in Stripe.`
      : b?.cancelled ? ` Their Pro subscription was cancelled${b.refunded ? ` and ${money(b.refunded, b.currency)} refunded` : ""}.` : ""
    setMsg(res.ok ? (action === "remove" ? `Removed from the program.${billingNote}` : `Reactivated (${body.status}). Billing isn't restarted; they can subscribe again.`) : body.message ?? "Couldn't save.")
    onChange()
  }
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="program-membership">
      <h2 className="font-medium">Program membership</h2>
      {data.removal ? (
        <>
          <p className="mt-1">
            <strong>Removed from the program</strong> on {day(data.removal.at)}{data.removal.by ? ` by ${data.removal.by}` : ""}. They can&apos;t sign in or use anything,
            and their QR goes to the program&apos;s page. Their leads will be deleted on {day(data.removal.deleteAfter)} unless they&apos;re reactivated.
          </p>
          <button type="button" data-testid="program-reactivate" disabled={busy} onClick={() => void act("reactivate")} className="mt-3 min-h-11 rounded-lg border border-border px-4 font-medium disabled:opacity-50">
            Undo: reactivate
          </button>
        </>
      ) : !confirm ? (
        <>
          <p className="mt-1 text-muted-foreground">Removing stops sign-in and every feature, sends their QR to the program&apos;s page, and starts the 12-month countdown to deleting their leads. A paid Pro subscription ends right away and the unused part of the month is refunded. Undo restores everything except billing (they can subscribe again).</p>
          <button type="button" data-testid="program-remove" disabled={busy} onClick={() => setConfirm(true)} className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-medium text-red-700 disabled:opacity-50 dark:border-red-800 dark:text-red-400">
            Remove from program
          </button>
        </>
      ) : (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
          <span>Remove {data.name} (Agent ID {data.agentId}) from the program?</span>
          <button type="button" data-testid="program-remove-confirm" disabled={busy} onClick={() => void act("remove")} className="min-h-11 rounded-lg border border-border bg-background px-3 font-medium">Yes, remove</button>
          <button type="button" onClick={() => setConfirm(false)} className="min-h-11 rounded-lg px-3">Cancel</button>
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-muted-foreground">{msg}</p>}
      {data.programLog.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-muted-foreground" data-testid="program-log">
          {data.programLog.map((l) => (
            <li key={l.at}>
              {new Date(l.at).toLocaleString()}: {l.action === "remove" ? "removed" : `reactivated (${l.status})`} by {l.admin}
              {l.billing?.cancelled && `; Pro cancelled${l.billing.refunded ? `, ${money(l.billing.refunded, l.billing.currency)} refunded` : ""}`}
              {l.billing?.error && `; Pro cancellation failed (${l.billing.error})`}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type DeletionSummary = { agentId: string; account: string | null; name: string | null; leads: number; events: number; photo: boolean; paidPro: boolean }

/**
 * Delete account (owner and program admins): what goes and what stays, then the
 * Agent ID typed again to confirm. Permanent. The server checks and logs it.
 */
function DeleteAccount({ agentId, base }: { agentId: string; base: string }) {
  const router = useRouter()
  const [summary, setSummary] = useState<DeletionSummary | null>(null)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const btn = "min-h-11 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50"

  async function preview() {
    setBusy(true); setMsg(null)
    const res = await fetch(`/api/admin/enterprise/nop/agent-deletion?agentId=${encodeURIComponent(agentId)}`)
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) setSummary(body.summary)
    else setMsg(body.message ?? "Couldn't load what would be deleted.")
  }
  async function remove() {
    setBusy(true); setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/agent-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, confirmAgentId: typed.trim(), confirm: true }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(body.message ?? "Couldn't delete the account.")
    router.push(base)
  }

  return (
    <section className="mt-6 rounded-xl border border-red-300 bg-card p-5 dark:border-red-800" data-testid="delete-account">
      <h2 className="font-medium">Delete account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanently deletes the agent&apos;s account and profile, page settings and photo, events, leads and RSVPs, and scan counts, and frees the Agent ID.
        A paid Pro subscription is cancelled first and the unused part refunded. Kept: the flyer download record, and the admin logs. This can&apos;t be undone.
      </p>
      {!summary ? (
        <button type="button" className={`${btn} mt-3`} disabled={busy} onClick={() => void preview()} data-testid="delete-preview">Delete account…</button>
      ) : (
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <p data-testid="delete-summary">
            Will delete: Agent ID {summary.agentId}{summary.name ? ` (${summary.name})` : ""}{summary.account ? `, account ${summary.account}` : ""}; {summary.leads} lead{summary.leads === 1 ? "" : "s"} and RSVPs; {summary.events} event{summary.events === 1 ? "" : "s"}{summary.photo ? "; their photo" : ""}.
            {summary.paidPro && <strong> Their paid Pro subscription will be cancelled and the unused part refunded.</strong>}
          </p>
          <label className="font-medium">Type the Agent ID to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="off" spellCheck={false} data-testid="delete-confirm-id" className="mt-1 block min-h-11 w-48 rounded-lg border border-border bg-background px-3" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${btn} border-red-400 text-red-700 dark:text-red-300`} disabled={busy || typed.trim() !== summary.agentId} onClick={() => void remove()} data-testid="delete-confirm">Delete permanently</button>
            <button type="button" className={btn} disabled={busy} onClick={() => { setSummary(null); setTyped("") }}>Keep the account</button>
          </div>
        </div>
      )}
      {msg && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{msg}</p>}
    </section>
  )
}
