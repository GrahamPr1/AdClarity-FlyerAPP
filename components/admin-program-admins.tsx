"use client"

import { useState } from "react"
import useSWR from "swr"

// /admin/enterprise/agents (owner only): who the program admins are; and, for
// everyone on the NOP screens, the log of every admin action.

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "Never")
type Admin = { email: string; name: string; addedBy: string; addedAt: string; lastSignInAt: string | null }
type Action = { at: string; actor: string; actorName: string | null; role: "owner" | "program"; action: string; detail: string }

export function AdminProgramAdmins() {
  const { data, mutate } = useSWR<{ admins: Admin[] }>("/api/admin/program-admins", fetcher)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  async function call(method: "POST" | "DELETE", body: unknown) {
    setMsg(null)
    const res = await fetch("/api/admin/program-admins", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const out = await res.json().catch(() => ({}))
    if (!res.ok) return setMsg(out.message ?? "Couldn't save.")
    await mutate(out, { revalidate: false })
    setName(""); setEmail("")
  }
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="program-admins">
      <h2 className="text-lg">Program admins</h2>
      <p className="mt-1 text-muted-foreground">They sign in at oneflyer.org/program with an emailed code and can use this NOP agents screen only: no business customers, billing, other orgs or site settings. Removing one ends their access at once.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {data?.admins.map((a) => (
          <li key={a.email} className="flex flex-wrap items-center justify-between gap-3">
            <span><strong>{a.name}</strong> · {a.email} <span className="text-muted-foreground">· last sign-in {when(a.lastSignInAt)}</span></span>
            <button type="button" className="min-h-11 rounded-lg border border-border px-3" onClick={() => void call("DELETE", { email: a.email })}>Remove</button>
          </li>
        ))}
        {data && data.admins.length === 0 && <li className="text-muted-foreground">None yet.</li>}
      </ul>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void call("POST", { name, email }) }}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block min-h-11 w-48 rounded-lg border border-border bg-background px-3" data-testid="pa-name" /></label>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block min-h-11 w-72 rounded-lg border border-border bg-background px-3" data-testid="pa-email-add" /></label>
        <button type="submit" disabled={!name.trim() || !email.trim()} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-50">Add program admin</button>
      </form>
      {msg && <p role="alert" className="mt-2 text-red-700">{msg}</p>}
    </section>
  )
}

export function AdminNopActivity() {
  const { data } = useSWR<{ actions: Action[] }>("/api/admin/enterprise/nop/admin-actions", fetcher)
  if (!data || data.actions.length === 0) return null
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="nop-admin-activity">
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-lg">Admin activity ({data.actions.length})</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {data.actions.map((a, i) => (
            <li key={`${a.at}-${i}`}>{when(a.at)} · {a.actorName ? `${a.actorName} (${a.actor})` : a.actor}{a.role === "program" ? " [program admin]" : ""}: {a.action.replace(/_/g, " ")}{a.detail ? ` — ${a.detail}` : ""}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}
