"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import type { AgentFlag } from "@/lib/types"
import type { RosterListEntry } from "@/lib/enterprise/agents-store"
import type { RosterRowFlag, RosterRowRejection } from "@/lib/enterprise/nop-roster"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
const th = "px-4 py-3 font-medium"
const td = "px-4 py-3 align-top"

type ImportReport = { created: number; updated: number; rejected: RosterRowRejection[]; flagged: RosterRowFlag[] }

function Table({ head, children, min = "48rem" }: { head: string[]; children: React.ReactNode; min?: string }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm" style={{ minWidth: min }}>
        <thead className="bg-[var(--surface-soft)] text-left text-xs uppercase tracking-widest text-muted-foreground/70">
          <tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function LockActions({ entry, onDone }: { entry: RosterListEntry; onDone: () => void }) {
  const [to, setTo] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!entry.lockedTo) return <span className="text-muted-foreground">—</span>

  async function act(body: Record<string, string>) {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/admin/enterprise/nop/agent-id/${entry.agentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, expectedOwner: entry.lockedTo }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(data.message ?? data.error ?? "Failed")
    setTo("")
    onDone()
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="break-all">{entry.lockedTo}</span>
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={busy} onClick={() => void act({ action: "unlock" })}>Unlock</button>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="reassign to email"
          className="min-w-0 flex-1 rounded-lg border border-border bg-[var(--surface-soft)] px-2 py-1 text-xs" />
        <button className={btn} disabled={busy || !to.trim()} onClick={() => void act({ action: "reassign", to })}>Reassign</button>
      </div>
      {msg && <span className="text-xs text-red-600 dark:text-red-400">{msg}</span>}
    </div>
  )
}

type RenderLogEntry = { agentId: string; account: string; template: string; format: string; kitVersion: string; at: string }

/**
 * Every flyer file an agent was given, previews included — the compliance
 * record the Basic Benefits contract asks for at termination. The table
 * shows the newest 200; the CSV is always the complete log.
 */
function RenderLog() {
  const [agentId, setAgentId] = useState("")
  const [applied, setApplied] = useState("")
  const q = applied ? `?agentId=${encodeURIComponent(applied)}` : ""
  const log = useSWR<{ entries: RenderLogEntry[]; total: number }>(`/api/admin/enterprise/nop/render-log${q}`, fetcher, { revalidateOnFocus: false })
  const csvHref = `/api/admin/enterprise/nop/render-log?format=csv${applied ? `&agentId=${encodeURIComponent(applied)}` : ""}`
  return (
    <section className="mt-10" data-testid="render-log">
      <h2 className="text-lg">Flyer generation log</h2>
      <p className="mt-1 text-sm text-muted-foreground">Every preview and download, never trimmed.</p>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(agentId.trim()) }}>
        <label htmlFor="log-agent" className="text-sm">Agent ID</label>
        <input id="log-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} inputMode="numeric" placeholder="All agents"
          className="w-36 rounded-lg border border-border bg-[var(--surface-soft)] px-3 py-1.5 text-sm" />
        <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-[var(--surface-sunken)]">Filter</button>
        {applied && <button type="button" onClick={() => { setAgentId(""); setApplied("") }} className="text-sm text-muted-foreground hover:text-foreground">Clear</button>}
        <a href={csvHref} className="ml-auto text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">
          Export {applied ? `agent ${applied}'s` : "the full"} log (CSV)
        </a>
      </form>
      {log.data && <p className="mt-3 text-sm text-muted-foreground">{log.data.total} entr{log.data.total === 1 ? "y" : "ies"}{log.data.total > log.data.entries.length ? `, newest ${log.data.entries.length} shown` : ""}.</p>}
      {log.data && log.data.entries.length > 0 && (
        <Table head={["When", "Agent ID", "Account", "Template", "Format", "Kit"]}>
          {log.data.entries.map((e, i) => (
            <tr key={`${e.at}-${i}`} className="border-t border-border">
              <td className={`${td} text-muted-foreground`}>{new Date(e.at).toLocaleString()}</td>
              <td className={td}>{e.agentId}</td>
              <td className={`${td} break-all`}>{e.account}</td>
              <td className={td}>{e.template}</td>
              <td className={td}>{e.format}</td>
              <td className={td}>{e.kitVersion}</td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  )
}

export default function NopAdminPage() {
  const roster = useSWR<{ roster: RosterListEntry[] }>("/api/admin/enterprise/nop/roster", fetcher, { revalidateOnFocus: false })
  const flags = useSWR<{ flags: AgentFlag[] }>("/api/admin/enterprise/nop/flags", fetcher, { revalidateOnFocus: false })
  const [csv, setCsv] = useState("")
  const [report, setReport] = useState<ImportReport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function runImport() {
    setBusy(true)
    setImportError(null)
    setReport(null)
    const res = await fetch("/api/admin/enterprise/nop/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setImportError(data.fileErrors?.join("; ") ?? data.error ?? "Import failed")
    setReport(data)
    void roster.mutate()
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground transition-colors hover:text-foreground">← Admin</Link>
      <h1 className="mt-4 text-2xl">Neighborhood Outreach Program — agents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Import the roster NOP issues. Re-importing updates existing agents, and a status change applies on the next
        request. Rows with placeholders or invalid values are rejected and listed below, never skipped silently.
      </p>

      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg">Import roster CSV</h2>
        <input type="file" accept=".csv,text/csv" className="mt-3 block text-sm"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} placeholder="…or paste CSV here"
          className="mt-3 w-full rounded-lg border border-border bg-[var(--surface-soft)] p-3 font-mono text-xs" />
        <button onClick={() => void runImport()} disabled={busy || !csv.trim()}
          className="mt-3 rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)] disabled:opacity-60">
          {busy ? "Importing…" : "Import"}
        </button>
        {importError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{importError}</p>}
        {report && (
          <div data-testid="import-report" className="mt-5 text-sm">
            <p>{report.created} created, {report.updated} updated, {report.rejected.length} rejected, {report.flagged.length} flagged.</p>
            {report.rejected.length > 0 && (
              <Table head={["Line", "Agent ID", "Rejected because"]} min="36rem">
                {report.rejected.map((r) => (
                  <tr key={r.line} className="border-t border-border">
                    <td className={td}>{r.line}</td>
                    <td className={td}>{r.agentId || "—"}</td>
                    <td className={td}><ul className="list-disc pl-4">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></td>
                  </tr>
                ))}
              </Table>
            )}
            {report.flagged.length > 0 && (
              <Table head={["Line", "Agent ID", "Imported, but check"]} min="36rem">
                {report.flagged.map((r) => (
                  <tr key={r.line} className="border-t border-border">
                    <td className={td}>{r.line}</td><td className={td}>{r.agentId}</td><td className={td}>{r.reason}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg">Flagged registration attempts</h2>
        {flags.data && flags.data.flags.length === 0 && <p className="mt-3 text-sm text-muted-foreground">None.</p>}
        {flags.data && flags.data.flags.length > 0 && (
          <Table head={["When", "Type", "Agent ID", "Account", "Detail"]}>
            {flags.data.flags.map((f) => (
              <tr key={f.id} className="border-t border-border">
                <td className={`${td} text-muted-foreground`}>{new Date(f.at).toLocaleString()}</td>
                <td className={td}>{f.type === "email_mismatch" ? "Email mismatch" : "ID already registered"}</td>
                <td className={td}>{f.agentId}</td>
                <td className={`${td} break-all`}>{f.account}</td>
                <td className={`${td} break-all`}>{f.type === "email_mismatch" ? `typed ${f.attemptedEmail}` : `held by ${f.heldBy}`}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <RenderLog />

      <section className="mt-10">
        <h2 className="text-lg">Roster</h2>
        {roster.isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
        {roster.data && roster.data.roster.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No agents imported yet.</p>}
        {roster.data && roster.data.roster.length > 0 && (
          <Table head={["Agent ID", "Agent", "Roster email", "Status", "Enrollment URL", "Registered to"]} min="64rem">
            {roster.data.roster.map((r) => (
              <tr key={r.agentId} className="border-t border-border">
                <td className={td}>{r.agentId}</td>
                <td className={td}>{r.agentName}<div className="text-xs text-muted-foreground">{r.companyName}</div></td>
                <td className={`${td} break-all`}>{r.rosterEmail}</td>
                <td className={`${td} capitalize`}>{r.status}</td>
                <td className={`${td} break-all`}>
                  {r.enrollmentUrl}
                  {r.enrollmentUrlMismatch && <div className="text-xs text-amber-700 dark:text-amber-300">Doesn&apos;t match the Agent ID</div>}
                </td>
                <td className={td}><LockActions entry={r} onDone={() => { void roster.mutate(); void flags.mutate() }} /></td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  )
}
