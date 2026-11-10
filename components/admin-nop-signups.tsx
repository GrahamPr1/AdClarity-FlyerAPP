"use client"

import { useState } from "react"
import useSWR from "swr"

// /admin/enterprise/agents: agents who signed up themselves wait here for
// approval, and so do display-name changes (the name prints on flyers).
// Approve / Reject are logged with the admin's account; the agent is
// emailed (approved: with a sign-in link; rejected: no reason given).

type Signup = { agentId: string; name: string; phone: string; email: string; lang: "en" | "es"; submittedAt: string; nameFits: boolean; recruiter: { agentId: string; name: string } | null }
type NameChange = { agentId: string; account: string; currentName: string; requestedName: string; requestedAt: string; nameFits: boolean }
type LogEntry = { at: string; admin: string; action: "approve" | "reject" | "approve_name" | "reject_name"; agentId: string; account: string; name: string; previousName?: string }
type State = { signups: Signup[]; nameChanges: NameChange[]; log: LogEntry[] }

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())
const when = (iso: string) => new Date(iso).toLocaleString()
const btn = "min-h-11 rounded-lg border border-border px-3 disabled:opacity-50"
const ACTION_LABEL: Record<LogEntry["action"], string> = { approve: "approved sign-up", reject: "rejected sign-up", approve_name: "approved name", reject_name: "rejected name" }

export function AdminNopSignups() {
  const { data, mutate } = useSWR<State>("/api/admin/enterprise/nop/signups", fetcher)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function decide(agentId: string, action: LogEntry["action"]) {
    setBusy(`${agentId}:${action}`)
    setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, action }) })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return setMsg(body.message ?? "Couldn't save.")
    if (body.emailSent === false) setMsg(`Saved, but the email to agent ${agentId} couldn't be sent.`)
    await mutate(body, { revalidate: false })
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="nop-signups">
      <h2 className="text-lg">Agent sign-ups</h2>
      <p className="mt-1 text-muted-foreground">
        Agents who signed up themselves. Until approved they get nothing: no flyers, no Pro, and their QR goes to the program&apos;s page.
        Approve emails them a sign-in link; Reject removes the sign-up (the ID can be claimed again) and tells them, without a reason.
      </p>
      {msg && <p role="alert" className="mt-2 text-red-700 dark:text-red-400">{msg}</p>}
      {!data ? <p className="mt-3 text-muted-foreground">Loading…</p> : (
        <>
          {data.signups.length === 0 ? <p className="mt-3 text-muted-foreground" data-testid="no-signups">No sign-ups waiting.</p> : (
            <ul className="mt-3 flex flex-col divide-y divide-border rounded-lg border border-border">
              {data.signups.map((s) => (
                <li key={s.agentId} data-signup={s.agentId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span>
                    <strong>{s.name}</strong> · Agent ID <span className="font-mono">{s.agentId}</span>
                    <span className="block text-muted-foreground">{s.phone} · {s.email} · {s.lang === "es" ? "Spanish" : "English"} · signed up {when(s.submittedAt)}</span>
                    {s.recruiter && <span className="block text-muted-foreground" data-testid="signup-recruiter">Recruited by {s.recruiter.name || "—"} (Agent ID {s.recruiter.agentId})</span>}
                    {!s.nameFits && <span className="block text-amber-700 dark:text-amber-300">Name may not fit the kit-v2 footer</span>}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className={btn} disabled={busy !== null} onClick={() => void decide(s.agentId, "approve")}>Approve</button>
                    <button type="button" className={btn} disabled={busy !== null} onClick={() => void decide(s.agentId, "reject")}>Reject</button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 font-medium">Name changes</h3>
          {data.nameChanges.length === 0 ? <p className="mt-1 text-muted-foreground">None waiting.</p> : (
            <ul className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border">
              {data.nameChanges.map((n) => (
                <li key={n.agentId} data-name-change={n.agentId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span>
                    Agent ID <span className="font-mono">{n.agentId}</span>: {n.currentName} → <strong>{n.requestedName}</strong>
                    <span className="block text-muted-foreground">{n.account} · asked {when(n.requestedAt)}</span>
                    {!n.nameFits && <span className="block text-amber-700 dark:text-amber-300">Name may not fit the kit-v2 footer</span>}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className={btn} disabled={busy !== null} onClick={() => void decide(n.agentId, "approve_name")}>Approve</button>
                    <button type="button" className={btn} disabled={busy !== null} onClick={() => void decide(n.agentId, "reject_name")}>Reject</button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {data.log.length > 0 && (
            <details className="mt-4" data-testid="signups-log">
              <summary className="min-h-11 cursor-pointer py-2">Decisions ({data.log.length})</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {data.log.map((l) => (
                  <li key={`${l.at}-${l.agentId}`}>{when(l.at)}: {l.admin} {ACTION_LABEL[l.action]} for Agent ID {l.agentId} ({l.previousName ? `${l.previousName} → ` : ""}{l.name})</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
