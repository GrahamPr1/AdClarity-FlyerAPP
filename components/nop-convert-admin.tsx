"use client"

import { useState } from "react"
import useSWR from "swr"
import type { BlockedAccount, ConversionRecord } from "@/lib/enterprise/account-conversion"

// "Convert to agent account" on /admin/enterprise/nop: roster emails that
// /agent/start refuses because a OneFlyer business account already uses
// them. The server re-checks everything; this shows what it returns.

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
const danger = "rounded-lg bg-[var(--brand-teal-bright)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)] disabled:opacity-60"

function AccountCard({ a, onDone }: { a: BlockedAccount; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function convert() {
    setBusy(true); setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: a.email, confirm: true }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false); setConfirming(false)
    if (!res.ok) return setMsg(data.error ?? "Conversion failed")
    setMsg(`Converted. ${a.agentName ?? "The agent"} can now finish Get started at /agent/start with Agent ID ${a.agentId}.`)
    onDone()
  }

  return (
    <li className="border-t border-border py-3 text-sm" data-testid={`blocked-${a.email}`}>
      <p className="font-medium break-all">{a.email}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {a.agentId ? `Roster: ${a.agentName} (Agent ID ${a.agentId})` : "Not any agent's roster email"}
        {" · "}plan {a.plan ?? "none"}{" · "}{a.flyers} flyer{a.flyers === 1 ? "" : "s"} stored{a.lifetimeFlyers !== null ? ` (${a.lifetimeFlyers} generated)` : ""}
        {a.createdAt ? ` · account created ${new Date(a.createdAt).toLocaleDateString()}` : ""}
        {a.hasPassword ? " · has a password" : ""}
      </p>
      {a.convertible && !confirming && <button type="button" className={`${btn} mt-2`} onClick={() => setConfirming(true)}>Convert to agent account</button>}
      {a.convertible && confirming && (
        <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3" role="group" aria-label="Confirm conversion">
          <p className="text-sm">
            Convert <span className="font-medium">{a.email}</span> to an agent account? Its password{a.plan ? ` and ${a.plan} plan` : ""} are removed, so it signs in with an emailed code like every agent.
            Its {a.flyers} stored flyer{a.flyers === 1 ? "" : "s"} stay stored, but it follows agent rules from now on (no free-form AI generation once the Agent ID is attached).
            {a.agentName ? ` ${a.agentName}` : " The agent"} then finishes Get started with Agent ID {a.agentId}.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={danger} disabled={busy} onClick={() => void convert()}>Yes, convert</button>
            <button type="button" className={btn} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!a.convertible && a.reason && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" data-testid="convert-reason">{a.reason}</p>}
      {msg && <p className="mt-2 text-xs" aria-live="polite">{msg}</p>}
    </li>
  )
}

export function ConvertAdmin() {
  const list = useSWR<{ blocked: BlockedAccount[]; conversions: ConversionRecord[] }>("/api/admin/enterprise/nop/convert", fetcher, { revalidateOnFocus: false })
  const [email, setEmail] = useState("")
  const [looked, setLooked] = useState<BlockedAccount | null>(null)

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLooked(await fetcher(`/api/admin/enterprise/nop/convert?email=${encodeURIComponent(email.trim())}`))
  }
  const refresh = () => { void list.mutate(); if (looked) void fetcher(`/api/admin/enterprise/nop/convert?email=${encodeURIComponent(looked.email)}`).then(setLooked) }

  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-5" data-testid="convert-admin">
      <h2 className="text-lg">Roster emails blocked by a business account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Get started refuses a roster email that already has a OneFlyer business account. If that account has no paid plan, you can convert it to an agent account; paid accounts stay blocked (contact OneFlyer).
      </p>
      {list.data && list.data.blocked.length === 0 && <p className="mt-3 text-sm text-muted-foreground">None right now.</p>}
      {list.data && list.data.blocked.length > 0 && <ul className="mt-2">{list.data.blocked.map((a) => <AccountCard key={a.email} a={a} onDone={refresh} />)}</ul>}
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={lookup}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Look up an email" aria-label="Email to look up"
          className="min-w-64 rounded-lg border border-border bg-[var(--surface-soft)] px-3 py-1.5 text-sm" />
        <button type="submit" className={btn}>Look up</button>
      </form>
      {looked && <ul className="mt-2">{"email" in looked ? <AccountCard key={`l-${looked.email}`} a={looked} onDone={refresh} /> : null}</ul>}
      {list.data && list.data.conversions.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium">Conversions</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {list.data.conversions.map((c) => (
              <li key={`${c.email}-${c.at}`}>{new Date(c.at).toLocaleString()} — {c.email} → Agent ID {c.agentId} by {c.by} (was {c.priorPlan ?? "no plan"}, {c.flyers} flyers kept)</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
