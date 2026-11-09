"use client"

import { useState } from "react"
import useSWR from "swr"

// /admin/enterprise/agents: the NOP enrollment domain. One setting behind
// every agent's enrollment URL: the QR forward and the address printed on the
// flyers. A save is checked live on the server before it's kept, and logged.

type Check = { url: string; ok: boolean; status: number | null; error: string | null }
type State = {
  domain: string
  defaultDomain: string
  testAgentId: string
  urls: { agent: string; program: string }
  live: { ok: boolean; checks: Check[] }
  log: { at: string; admin: string; from: string; to: string }[]
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {checks.map((c) => (
        <li key={c.url} className="break-all">
          <span className={c.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{c.ok ? "Loads" : "Doesn't load"}</span>{" "}
          <span className="font-mono text-xs">{c.url}</span>
          {!c.ok && <span className="text-muted-foreground"> ({c.error ?? `HTTP ${c.status}`})</span>}
        </li>
      ))}
    </ul>
  )
}

export function AdminEnrollDomain() {
  const { data, mutate } = useSWR<State>("/api/admin/enterprise/nop/enroll-domain", fetcher)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ message: string; checks: Check[]; ok: boolean } | null>(null)

  async function save() {
    setBusy(true)
    setResult(null)
    const res = await fetch("/api/admin/enterprise/nop/enroll-domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: draft }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setResult({ ok: false, message: body.message ?? "Couldn't save.", checks: body.checks ?? [] })
    setResult({ ok: true, message: `Saved. A test agent's QR now forwards to ${body.urls.agent}`, checks: body.saved.checks })
    setDraft("")
    await mutate(body, { revalidate: false })
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="nop-enroll-domain">
      <h2 className="text-lg">NOP enrollment domain</h2>
      <p className="mt-1 text-muted-foreground">
        Every agent&apos;s enrollment URL is https://<em>domain</em>/<em>Agent ID</em>: where their flyer QR forwards and the address printed on their flyers (both kits).
        Unknown or inactive agents&apos; QRs go to https://<em>domain</em>/.
      </p>
      {!data ? <p className="mt-3 text-muted-foreground">Checking…</p> : (
        <>
          {!data.live.ok && (
            <p role="alert" data-testid="enroll-domain-warning" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
              <strong>The current enrollment domain doesn&apos;t load.</strong> Every agent&apos;s QR and printed link lead to a page that doesn&apos;t work right now.
              Don&apos;t switch agents to kit v2 until the Neighborhood Outreach Program confirms the URL and it loads.
            </p>
          )}
          <p className="mt-3">
            Current: <strong className="font-mono" data-testid="enroll-domain-current">{data.domain}</strong>
            {data.domain === data.defaultDomain && <span className="text-muted-foreground"> (the kit&apos;s default)</span>}
          </p>
          <p className="mt-2">A test agent&apos;s QR ({data.testAgentId}) forwards to <span className="font-mono break-all" data-testid="enroll-domain-example">{data.urls.agent}</span></p>
          <CheckList checks={data.live.checks} />
          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <label>
              New domain
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="join.basicbenefits.com" data-testid="enroll-domain-input"
                className="mt-1 block min-h-11 w-72 rounded-lg border border-border bg-background px-3 font-mono" />
            </label>
            <button type="submit" disabled={busy || !draft.trim()} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-50">{busy ? "Checking…" : "Check and save"}</button>
          </form>
          <p className="mt-1 text-muted-foreground">basicbenefits.com hosts only. Saved only if the test agent&apos;s URL and the program page both load now.</p>
          {result && (
            <div role="status" data-testid="enroll-domain-result" className={"mt-3 " + (result.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
              <p>{result.message}</p>
              {result.checks.length > 0 && <CheckList checks={result.checks} />}
            </div>
          )}
          {data.log.length > 0 && (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2">Changes ({data.log.length})</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {data.log.map((l) => <li key={l.at}>{new Date(l.at).toLocaleString()}: {l.from} → {l.to} by {l.admin}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
