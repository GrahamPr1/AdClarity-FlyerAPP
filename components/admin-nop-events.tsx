"use client"

import { useState } from "react"
import useSWR from "swr"
import type { AdminEventRow, AdminEventStatus } from "@/app/api/admin/enterprise/nop/events/route"

// The admin Events list (owner and program admins): every agent's event, with
// Hide (takes the public page down, emails the agent, logged) and Unhide.
// Hide asks again first.

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const STATUS: Record<AdminEventStatus, string> = { upcoming: "Upcoming", ended: "Ended", cancelled: "Cancelled", hidden: "Hidden" }
const button = "min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-medium disabled:opacity-60"

export function AdminNopEvents() {
  const { data, mutate } = useSWR<{ events: AdminEventRow[] }>("/api/admin/enterprise/nop/events", fetcher)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(e: AdminEventRow, action: "hide" | "unhide") {
    setBusy(e.id); setMsg(null); setConfirm(null)
    const res = await fetch("/api/admin/enterprise/nop/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, action }) })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) setMsg(body.message ?? "Couldn't save.")
    else setMsg(`${action === "hide" ? "Hidden" : "Unhidden"}: "${e.title}". ${body.agentEmailed ? "The agent was emailed." : "The email to the agent didn't go out."}`)
    await mutate()
  }

  return (
    <section className="mt-8" data-testid="admin-events">
      <h2 className="text-lg">Events</h2>
      <p className="mt-1 text-sm text-muted-foreground">Every agent event. Hide takes the public page down (it says &ldquo;This event isn&apos;t available&rdquo;, takes no RSVPs and sends no reminders) and emails the agent. Both are logged.</p>
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
      {!data ? <p className="mt-3 text-muted-foreground">Loading…</p> : data.events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No events yet.</p> : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground/70">
              <th className="px-4 py-3">Agent</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">When</th><th className="px-4 py-3">RSVPs</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody>{data.events.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 align-top" data-testid="admin-event-row" data-event-id={e.id}>
                <td className="px-4 py-3">{e.agentName ?? "—"}<span className="block text-xs text-muted-foreground">{e.agentId}</span></td>
                <td className="px-4 py-3"><a href={e.link} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-teal-bright)] hover:underline">{e.title}</a></td>
                <td className="px-4 py-3 whitespace-nowrap">{e.when}</td>
                <td className="px-4 py-3">{e.rsvps}{e.rsvps > 0 && <span className="text-muted-foreground"> ({e.guests} people)</span>}</td>
                <td className="px-4 py-3" data-testid="admin-event-status">{STATUS[e.status]}{e.status === "hidden" && e.hiddenBy && <span className="block text-xs text-muted-foreground">by {e.hiddenBy}</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {e.status === "hidden" ? (
                    <button type="button" className={button} disabled={busy === e.id} onClick={() => void act(e, "unhide")} data-testid="admin-event-unhide">Unhide</button>
                  ) : confirm === e.id ? (
                    <span className="flex flex-wrap gap-2">
                      <button type="button" className={button} disabled={busy === e.id} onClick={() => void act(e, "hide")} data-testid="admin-event-hide-confirm">Yes, hide it and email the agent</button>
                      <button type="button" className={button} onClick={() => setConfirm(null)}>Keep it up</button>
                    </span>
                  ) : (
                    <button type="button" className={button} onClick={() => setConfirm(e.id)} data-testid="admin-event-hide">Hide</button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
