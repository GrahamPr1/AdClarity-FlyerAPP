"use client"

import { useState } from "react"
import useSWR from "swr"
import type { AgentDataMove } from "@/lib/enterprise/portal/agent-data"

// Admin pieces for NOP Phase 2 on /admin/enterprise/agents: the org's
// approved wording (lead-form consent) and moving an Agent ID's leads and
// scans to another Agent ID. English only, like the rest of admin.

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never")
const input = "mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3"

type TextRow = { id: string; key: string; label: string; lang: "en" | "es"; text: string; version: number; pending: boolean; updatedBy: string | null; updatedAt: string | null }

export function AdminApprovedText() {
  const texts = useSWR<{ texts: TextRow[] }>("/api/admin/enterprise/nop/approved-text", fetcher)
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5" data-testid="approved-text">
      <h2 className="text-lg">Approved wording (NOP)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown word for word on agents&apos; public pages. While a text is still the placeholder, the page that needs it shows &ldquo;Coming soon&rdquo;. Paste only Basic Benefits&apos; final approved text; leave blank to go back to the placeholder.
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
          {row.pending ? "· placeholder: public page shows Coming soon" : `· live, version ${row.version}, saved ${when(row.updatedAt)} by ${row.updatedBy}`}
        </span>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={row.pending ? row.text : undefined} className={`${input} py-2`} />
      </label>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy} className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Save</button>
        {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  )
}

type Side = { agentId: string; leads: number; scans: number; onRoster: boolean; name: string | null; status: string | null; account: string | null }

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
  const describe = (s: Side) => `${s.agentId}${s.name ? ` · ${s.name}` : ""}${s.status ? ` · ${s.status}` : s.onRoster ? "" : " · not on the roster"}${s.account ? ` · ${s.account}` : " · no account"}`

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5" data-testid="agent-data-move">
      <h2 className="text-lg">Move an Agent ID&apos;s data</h2>
      <p className="mt-1 text-sm text-muted-foreground">Leads and QR scans belong to the Agent ID. This moves all of them from one Agent ID to another, keeping their dates. It can&apos;t be undone automatically; every move is logged below.</p>
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
