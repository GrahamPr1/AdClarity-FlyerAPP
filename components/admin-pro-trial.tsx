"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import type { ProTrialSetting } from "@/lib/enterprise/portal/pro-trial"

// The Pro free trial (owner only): off by default. When on, agents who never
// had a trial or a subscription see "Try Pro free for X days"; Stripe still
// takes the card and charges it when the trial ends unless they cancel.

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function AdminProTrial() {
  const { data, mutate } = useSWR<{ setting: ProTrialSetting; log: ProTrialSetting[]; limits: { min: number; max: number } }>("/api/admin/enterprise/nop/pro-trial", fetcher)
  const [days, setDays] = useState("14")
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (data) setDays(String(data.setting.days)) }, [data])
  async function save(enabled: boolean) {
    setMsg(null)
    const res = await fetch("/api/admin/enterprise/nop/pro-trial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, days: Number(days) }) })
    const body = await res.json().catch(() => ({}))
    setMsg(res.ok ? (enabled ? `Free trial on: ${body.setting.days} days.` : "Free trial off.") : body.message ?? "Couldn't save.")
    await mutate()
  }
  if (!data) return null
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="admin-pro-trial">
      <h2 className="text-lg">Pro free trial</h2>
      <p className="mt-1 text-muted-foreground">
        Off by default. When on, an agent who has never had a trial or a Pro subscription gets this many days free at checkout. A card is still required, and Stripe charges it when the trial ends unless they cancel. One trial per agent, ever.
        <strong> It is {data.setting.enabled ? `on (${data.setting.days} days)` : "off"}.</strong>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label>Days<input type="number" min={data.limits.min} max={data.limits.max} value={days} onChange={(e) => setDays(e.target.value)} className="mt-1 block min-h-11 w-24 rounded-lg border border-border bg-background px-3" data-testid="trial-days" /></label>
        <button type="button" onClick={() => void save(true)} className="min-h-11 rounded-lg border border-border px-3 font-medium" data-testid="trial-on">{data.setting.enabled ? "Save days" : "Turn the free trial on"}</button>
        {data.setting.enabled && <button type="button" onClick={() => void save(false)} className="min-h-11 rounded-lg border border-border px-3 font-medium" data-testid="trial-off">Turn it off</button>}
      </div>
      {msg && <p role="status" className="mt-2">{msg}</p>}
      {data.log.length > 0 && (
        <details className="mt-2"><summary className="cursor-pointer text-muted-foreground">Changes</summary>
          <ul className="mt-1">{data.log.map((l, i) => <li key={i}>{l.updatedAt && new Date(l.updatedAt).toLocaleString()} · {l.updatedBy}: {l.enabled ? `on, ${l.days} days` : "off"}</li>)}</ul>
        </details>
      )}
    </section>
  )
}
