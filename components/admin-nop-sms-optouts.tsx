"use client"

import { useState } from "react"
import useSWR from "swr"
import type { SmsOptOut } from "@/lib/enterprise/sms-optout"

// SMS opt-outs (owner and program admins). Nothing sends text messages yet;
// this list is checked by any future texting, with each lead's own text-message
// consent. Add a number when someone asks not to be texted. Add-only.

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const field = "mt-1 block min-h-11 rounded-lg border border-border bg-background px-3"

export function AdminNopSmsOptOuts() {
  const { data, mutate } = useSWR<{ optOuts: SmsOptOut[] }>("/api/admin/enterprise/nop/sms-optouts", fetcher)
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/sms-optouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, note }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg(body.message ?? "Couldn't add it.")
    setMsg(body.already ? `${body.optOut.phone} was already opted out.` : `Added ${body.optOut.phone}.`)
    setPhone(""); setNote("")
    await mutate()
  }
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="admin-sms-optouts">
      <h2 className="text-lg">Text message opt-outs</h2>
      <p className="mt-1 text-muted-foreground">
        Nothing sends text messages yet. When it does, it will only text people who ticked the separate text-message box on a lead form, and never a number on this list.
        Add a number when someone asks not to be texted (a STOP reply, a call or an email). Numbers can&apos;t be taken off.
      </p>
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-3">
        <label>Phone number<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(270) 555-0100" className={`${field} w-44`} data-testid="optout-phone" /></label>
        <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Replied STOP" className={`${field} w-64`} /></label>
        <button type="submit" disabled={busy || !phone.trim()} className="min-h-11 rounded-lg border border-border px-3 font-medium disabled:opacity-50" data-testid="optout-add">Add to opt-outs</button>
      </form>
      {msg && <p role="status" className="mt-2">{msg}</p>}
      {data && (data.optOuts.length === 0 ? <p className="mt-3 text-muted-foreground">No opt-outs yet.</p> : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border" data-testid="optout-list">
          {data.optOuts.map((o) => (
            <li key={o.phone} className="flex flex-wrap gap-x-4 px-4 py-2"><span className="font-mono">{o.phone}</span><span>{new Date(o.at).toLocaleDateString()}</span><span className="text-muted-foreground">{o.by}</span>{o.note && <span className="text-muted-foreground">{o.note}</span>}</li>
          ))}
        </ul>
      ))}
    </section>
  )
}
