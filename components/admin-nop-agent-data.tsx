"use client"

import { useState } from "react"
import useSWR from "swr"
import type { AgentDataMove, LeadDeletion } from "@/lib/enterprise/portal/agent-data"

// Admin pieces for NOP Phase 2 on /admin/enterprise/agents: the org's
// approved wording (consent, packages, follow-up messages), moving an Agent ID's leads and scans
// to another Agent ID, and deleting leads on request. English only, like the
// rest of admin.

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never")
const input = "mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3"

type TextRow = { id: string; key: string; label: string; help: string | null; lang: "en" | "es"; text: string; version: number; pending: boolean; updatedBy: string | null; updatedAt: string | null }

export function AdminApprovedText() {
  const texts = useSWR<{ texts: TextRow[] }>("/api/admin/enterprise/nop/approved-text", fetcher)
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5" data-testid="approved-text">
      <h2 className="text-lg">Approved wording (NOP)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Used word for word on agents&apos; public pages and in the follow-up messages agents open in their own apps. While a text is still the placeholder, the page that needs it shows &ldquo;Coming soon&rdquo; (a follow-up message just has no button). Paste only the Neighborhood Outreach Program&apos;s final approved text; leave blank to go back to the placeholder.
      </p>
      {texts.data?.texts.map((t) => <TextEditor key={t.id} row={t} onSaved={() => void texts.mutate()} />)}
    </section>
  )
}

function TextEditor({ row, onSaved }: { row: TextRow; onSaved: () => void }) {
  const [text, setText] = useState(row.pending ? "" : row.text)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/approved-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: row.key, lang: row.lang, text }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(json.message ?? "Couldn't save.")
    setMsg("Saved.")
    onSaved()
  }
  return (
    <div className="mt-4" data-text={`${row.key}:${row.lang}`}>
      <label className="text-sm font-medium">
        {row.label} ({row.lang.toUpperCase()}){" "}
        <span className={row.pending ? "text-amber-600" : "text-muted-foreground"}>
          {row.pending ? (row.key.startsWith("followUp") ? "· placeholder: no button for agents" : "· placeholder: public page shows Coming soon") : `· live, version ${row.version}, saved ${when(row.updatedAt)} by ${row.updatedBy}`}
        </span>
        {row.help && <span className="mt-1 block text-xs font-normal text-muted-foreground">{row.help}</span>}
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={row.pending ? row.text : undefined} className={`${input} py-2`} />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy} className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Save</button>
        {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  )
}

type Side = { agentId: string; leads: number; scans: number; onRoster: boolean; name: string | null; status: string | null; account: string | null; qrCode: string | null }

export function AdminAgentDataMove() {
  const moves = useSWR<{ moves: AgentDataMove[] }>("/api/admin/enterprise/nop/agent-data-move", fetcher)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [preview, setPreview] = useState<{ from: Side; to: Side } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(payload: Record<string, unknown>) {
    setBusy(true)
    setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/agent-data-move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, ...payload }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    return { ok: res.ok, json }
  }
  async function doPreview() {
    setPreview(null)
    setConfirmed(false)
    const r = await post({ action: "preview" })
    if (!r.ok) return setMsg(r.json.message ?? "Couldn't preview.")
    setPreview(r.json)
  }
  async function doMove() {
    if (!preview) return
    const r = await post({ action: "move", confirm: true, expected: { leads: preview.from.leads, scans: preview.from.scans } })
    if (!r.ok) return setMsg(r.json.message ?? "Couldn't move.")
    setMsg(`Moved ${r.json.move.moved.leads} leads and ${r.json.move.moved.scans} scans from ${r.json.move.from} to ${r.json.move.to}.`)
    setPreview(null)
    setConfirmed(false)
    await moves.mutate()
  }
  const describe = (s: Side) => `${s.agentId}${s.name ? ` · ${s.name}` : ""}${s.status ? ` · ${s.status}` : s.onRoster ? "" : " · not on the roster"}${s.account ? ` · ${s.account}` : " · no account"}${s.qrCode ? ` · QR /a/${s.qrCode}` : ""}`

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5" data-testid="agent-data-move">
      <h2 className="text-lg">Move an Agent ID&apos;s data</h2>
      <p className="mt-1 text-sm text-muted-foreground">Leads and QR scans belong to the Agent ID. This moves all of them from one Agent ID to another, keeping their dates. It can&apos;t be undone automatically; every move is logged below. QR codes never move: each stays with its Agent ID, so later scans of the old ID&apos;s flyers still count there.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">From Agent ID<input value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null) }} inputMode="numeric" className={`${input} w-40`} /></label>
        <label className="text-sm">To Agent ID<input value={to} onChange={(e) => { setTo(e.target.value); setPreview(null) }} inputMode="numeric" className={`${input} w-40`} /></label>
        <button type="button" onClick={() => void doPreview()} disabled={busy || !from || !to} className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Preview</button>
      </div>
      {preview && (
        <div className="mt-4 rounded-lg border border-border p-4 text-sm" data-testid="move-preview">
          <p>From: {describe(preview.from)}</p>
          <p>To: {describe(preview.to)}</p>
          <p className="mt-2 font-medium">Will move: {preview.from.leads} leads and {preview.from.scans} QR scans. {preview.to.agentId} then has {preview.to.leads + preview.from.leads} leads and {preview.to.scans + preview.from.scans} scans.</p>
          {preview.from.leads + preview.from.scans === 0 ? (
            <p className="mt-2 text-muted-foreground">Nothing to move.</p>
          ) : (
            <>
              <label className="mt-3 flex min-h-11 items-center gap-3">
                <input type="checkbox" data-testid="move-confirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I&apos;ve checked both Agent IDs and want to move this data.
              </label>
              <button type="button" onClick={() => void doMove()} disabled={busy || !confirmed} className="mt-2 min-h-11 rounded-lg bg-[var(--destructive)] px-4 text-sm font-semibold text-white disabled:opacity-50">
                Move {preview.from.leads} leads and {preview.from.scans} scans
              </button>
            </>
          )}
        </div>
      )}
      {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}
      <h3 className="mt-6 text-sm font-medium">Moves</h3>
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm" data-testid="move-log">
        {(moves.data?.moves ?? []).map((m, i) => (
          <li key={i} className="flex flex-wrap gap-x-4 px-4 py-2"><span className="whitespace-nowrap">{when(m.at)}</span><span>{m.admin}</span><span>moved {m.moved.leads} leads and {m.moved.scans} scans</span><span>{m.from} → {m.to}</span></li>
        ))}
        {moves.data && moves.data.moves.length === 0 && <li className="px-4 py-3 text-muted-foreground">None yet.</li>}
      </ul>
    </section>
  )
}

type Match = { agentId: string; agentName?: string; lead: { id: string; name: string; phone: string; email: string | null; createdAt: string } }
type Clock = { endedAt: string; reason: string; deleteAfter: string } | null

export function AdminLeadDeletion() {
  const log = useSWR<{ deletions: LeadDeletion[] }>("/api/admin/enterprise/nop/lead-deletions", fetcher)
  const [mode, setMode] = useState<"person" | "agent">("person")
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<{ matches: Match[]; retention?: Clock; agentId?: string } | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function search() {
    setMsg(null); setFound(null); setPicked(new Set()); setConfirmed(false)
    const url = mode === "person" ? `/api/admin/enterprise/nop/lead-deletions?q=${encodeURIComponent(query)}` : `/api/admin/enterprise/nop/lead-deletions?agentId=${encodeURIComponent(query.trim())}`
    const res = await fetch(url); const json = await res.json().catch(() => ({}))
    if (!res.ok) return setMsg(json.message ?? "Couldn't search.")
    setFound({ ...json, agentId: mode === "agent" ? query.trim() : undefined })
  }

  async function remove() {
    if (!found) return
    setBusy(true); setMsg(null)
    // Grouped by Agent ID: one logged deletion per agent.
    const byAgent = new Map<string, string[]>()
    if (mode === "agent") byAgent.set(found.agentId!, ["all"])
    else for (const m of found.matches) if (picked.has(m.lead.id)) byAgent.set(m.agentId, [...(byAgent.get(m.agentId) ?? []), m.lead.id])
    let deleted = 0
    for (const [agentId, ids] of byAgent) {
      const all = ids[0] === "all"
      const res = await fetch("/api/admin/enterprise/nop/lead-deletions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, leadIds: all ? "all" : ids, expectedCount: all ? found.matches.length : undefined, requestedBy: mode === "person" ? "person" : "basic_benefits", note, confirm: true }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setBusy(false); return setMsg(json.message ?? "Couldn't delete.") }
      deleted += json.deletion.leadIds.length
    }
    setBusy(false); setFound(null); setConfirmed(false); setNote("")
    setMsg(`Deleted ${deleted} lead${deleted === 1 ? "" : "s"}. Logged.`)
    await log.mutate()
  }

  const count = mode === "agent" ? found?.matches.length ?? 0 : picked.size
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5" data-testid="lead-deletion">
      <h2 className="text-lg">Delete leads on request</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Leads are kept while an agent is active and deleted 12 months after the agent is terminated or removed from the roster. Delete sooner here when the person, or the Neighborhood Outreach Program, asks. Every deletion is logged without the person&apos;s details.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">Request from
          <select value={mode} onChange={(e) => { setMode(e.target.value as "person" | "agent"); setFound(null) }} className={`${input} w-56`}>
            <option value="person">The person (find by phone or email)</option>
            <option value="agent">Neighborhood Outreach Program (all of one agent&apos;s leads)</option>
          </select>
        </label>
        <label className="text-sm">{mode === "person" ? "Phone or email" : "Agent ID"}
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${input} w-64`} />
        </label>
        <button type="button" onClick={() => void search()} disabled={!query.trim()} className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Find leads</button>
      </div>
      {found && (
        <div className="mt-4 text-sm" data-testid="deletion-matches">
          {mode === "agent" && found.retention && <p className="mb-2 text-muted-foreground">Retention: {found.retention.reason.replace(/_/g, " ")} {when(found.retention.endedAt)}; due for deletion after {when(found.retention.deleteAfter)}.</p>}
          {found.matches.length === 0 ? <p className="text-muted-foreground">No leads found.</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {found.matches.map((m) => (
                <li key={m.lead.id} className="flex flex-wrap items-center gap-x-4 px-3 py-2">
                  {mode === "person" && <input type="checkbox" aria-label={`Select ${m.lead.name}`} checked={picked.has(m.lead.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(m.lead.id); else n.delete(m.lead.id); return n })} />}
                  <span>{m.lead.name}</span><span>{m.lead.phone}</span>{m.lead.email && <span>{m.lead.email}</span>}
                  <span className="text-muted-foreground">Agent {m.agentId}{m.agentName ? ` · ${m.agentName}` : ""} · {when(m.lead.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {count > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              <label>Note (optional, no personal details)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={input} /></label>
              <label className="flex min-h-11 items-center gap-3"><input type="checkbox" data-testid="deletion-confirm" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Permanently delete {count} lead{count === 1 ? "" : "s"}. This can&apos;t be undone.</label>
              <button type="button" onClick={() => void remove()} disabled={busy || !confirmed} className="min-h-11 w-fit rounded-lg bg-[var(--destructive)] px-4 font-semibold text-white disabled:opacity-50">Delete {count} lead{count === 1 ? "" : "s"}</button>
            </div>
          )}
        </div>
      )}
      {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}
      <h3 className="mt-6 text-sm font-medium">Deletions</h3>
      <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm" data-testid="deletion-log">
        {(log.data?.deletions ?? []).map((d, i) => (
          <li key={i} className="flex flex-wrap gap-x-4 px-4 py-2"><span className="whitespace-nowrap">{when(d.at)}</span><span>{d.admin}</span><span>deleted {d.leadIds.length} lead{d.leadIds.length === 1 ? "" : "s"} of Agent {d.agentId}</span><span>{d.requestedBy === "retention" ? "12 months after the agent left the program" : `asked by ${d.requestedBy === "person" ? "the person" : "Neighborhood Outreach Program"}`}</span>{d.note && <span className="text-muted-foreground">{d.note}</span>}</li>
        ))}
        {log.data && log.data.deletions.length === 0 && <li className="px-4 py-3 text-muted-foreground">None yet.</li>}
      </ul>
    </section>
  )
}

type RetentionRun = { at: string; mode: "dry_run" | "live"; by: string; agents: { agentId: string; leads: number; deleted: number; skipped?: string }[]; totalLeads: number; totalDeleted: number }

/** The 12-month deletion job: whether it deletes or only reports, its runs, and a dry run on demand. */
export function AdminRetentionJob() {
  const { data, mutate } = useSWR<{ live: boolean; runs: RetentionRun[] }>("/api/admin/enterprise/nop/retention", fetcher)
  const [busy, setBusy] = useState(false)
  async function dryRun() {
    setBusy(true)
    const res = await fetch("/api/admin/enterprise/nop/retention", { method: "POST" })
    if (res.ok) await mutate(await res.json(), { revalidate: false })
    setBusy(false)
  }
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="nop-retention">
      <h2 className="text-lg">Scheduled lead deletion</h2>
      <p className="mt-1 text-muted-foreground">
        Every day, leads of agents who left the program (terminated, or removed from the roster) 12 or more months ago are deleted.
        {data && (data.live ? <strong> It is on: it deletes.</strong> : <strong> It is in dry-run mode: it only reports what it would delete.</strong>)}
      </p>
      <button type="button" disabled={busy} onClick={() => void dryRun()} className="mt-3 min-h-11 rounded-lg border border-border px-3 disabled:opacity-50" data-testid="retention-dry-run">
        {busy ? "Checking…" : "Run a dry run now"}
      </button>
      {data && data.runs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1" data-testid="retention-runs">
          {data.runs.map((r) => (
            <li key={r.at}>
              {when(r.at)} · {r.mode === "live" ? "deleted" : "dry run"} by {r.by}: {r.agents.filter((a) => !a.skipped).length} agent(s) due, {r.totalLeads} lead(s) found{r.mode === "live" ? `, ${r.totalDeleted} deleted` : ", nothing deleted"}
              {r.agents.length > 0 && <span className="text-muted-foreground"> ({r.agents.map((a) => `${a.agentId}: ${a.skipped ? a.skipped.replace(/_/g, " ") : `${a.leads} lead(s)`}`).join("; ")})</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
