"use client"

import { useState } from "react"
import useSWR from "swr"

// /admin/enterprise/agents: the NOP enrollment setting, in three parts: where
// an agent's QR forwards, the address printed on their flyers, and the
// program page. A save is checked live on the server (URLs load, the test
// agent's page shows a real partner) before it's kept, and logged.

type Check = { url: string; ok: boolean; status: number | null; error: string | null }
type Page = { url: string; ok: boolean; problem: "not_found" | "blank" | "error" | null; text: string }
type Targets = { forwardTemplate: string; printed: "short" | "code"; printedTemplate: string | null; programUrl: string }
type State = {
  targets: Targets
  saved: { savedAt: string; admin: string } | null
  derivedFromDomain: string | null
  testAgentId: string
  urls: { agent: string; printed: string | null; program: string }
  printedExample: string
  live: { ok: boolean; checks: Check[] }
  log: { at: string; admin: string; to: Targets; savedDespiteWarning: boolean }[]
  domainLog: { at: string; admin: string; from: string; to: string }[]
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())
const input = "mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono"

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

function PageList({ pages }: { pages: Page[] }) {
  return (
    <ul className="mt-1 flex flex-col gap-1" data-testid="enroll-page-checks">
      {pages.map((p) => (
        <li key={p.url} className="break-all">
          <span className={p.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
            {p.ok ? "Shows a page" : p.problem === "not_found" ? "Partner not found" : p.problem === "blank" ? "Shows nothing" : "Doesn't load"}
          </span>{" "}
          <span className="font-mono text-xs">{p.url}</span>
          {p.text && <span className="block text-xs text-muted-foreground">“{p.text.slice(0, 160)}”</span>}
        </li>
      ))}
    </ul>
  )
}

export function AdminEnrollDomain() {
  const { data, mutate } = useSWR<State>("/api/admin/enterprise/nop/enroll-settings", fetcher)
  const [edited, setDraft] = useState<Targets | null>(null)
  // The form starts from the current setting until the admin edits it.
  const draft = edited ?? (data ? { ...data.targets, printedTemplate: data.targets.printedTemplate ?? "" } : null)
  const [busy, setBusy] = useState<"save" | "check" | null>(null)
  const [result, setResult] = useState<{ message: string; ok: boolean; checks: Check[]; pages: Page[]; warning: boolean } | null>(null)
  const [checked, setChecked] = useState<Page[] | null>(null)

  async function save(saveDespiteWarning = false) {
    if (!draft) return
    setBusy("save")
    setResult(null)
    const res = await fetch("/api/admin/enterprise/nop/enroll-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, saveDespiteWarning }) })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return setResult({ ok: false, message: body.message ?? "Couldn't save.", checks: body.checks ?? [], pages: body.pages ?? [], warning: body.error === "page_warning" })
    setResult({ ok: true, message: `Saved. A test agent's QR now forwards to ${body.urls.agent}, and flyers print ${body.printedExample}.`, checks: body.entry.checks, pages: body.pages ?? [], warning: false })
    await mutate(body, { revalidate: false })
  }

  async function checkPage() {
    setBusy("check")
    setChecked(null)
    const res = await fetch("/api/admin/enterprise/nop/enroll-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: true }) })
    setChecked(((await res.json().catch(() => ({}))) as { pages?: Page[] }).pages ?? [])
    setBusy(null)
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5 text-sm" data-testid="nop-enroll-domain">
      <h2 className="text-lg">NOP enrollment link</h2>
      <p className="mt-1 text-muted-foreground">
        Three parts: where every agent&apos;s flyer QR forwards (with their Agent ID as <span className="font-mono">{"{id}"}</span>), the address printed on their flyers (both kits), and the program page that unknown or inactive agents&apos; QRs go to.
      </p>
      {!data || !draft ? <p className="mt-3 text-muted-foreground">Checking…</p> : (
        <>
          {!data.live.ok && (
            <p role="alert" data-testid="enroll-domain-warning" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
              <strong>The current enrollment link doesn&apos;t load.</strong> Every agent&apos;s QR and printed link lead to a page that doesn&apos;t work right now.
            </p>
          )}
          <p className="mt-3" data-testid="enroll-setting-status">
            {data.saved
              ? <>Saved {new Date(data.saved.savedAt).toLocaleString()} by {data.saved.admin}.</>
              : <>Not saved in this form yet: still the old single domain <strong className="font-mono">{data.derivedFromDomain}</strong>, shown below as the three parts. Agents can&apos;t be switched to kit v2 until it&apos;s saved.</>}
          </p>
          <p className="mt-2">A test agent&apos;s QR ({data.testAgentId}) forwards to <span className="font-mono break-all" data-testid="enroll-domain-example">{data.urls.agent}</span>; their flyers print <span className="font-mono break-all">{data.printedExample}</span>.</p>
          <CheckList checks={data.live.checks} />
          <button type="button" onClick={() => void checkPage()} disabled={busy !== null} className="mt-2 min-h-11 rounded-lg border border-border px-3 disabled:opacity-50" data-testid="enroll-check-page">
            {busy === "check" ? "Opening the page (up to 20s)…" : "Check the test agent's page in a browser"}
          </button>
          {checked && <PageList pages={checked} />}

          <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save() }}>
            <label>
              Forward URL (where QRs go)
              <input value={draft.forwardTemplate} onChange={(e) => setDraft({ ...draft, forwardTemplate: e.target.value })} data-testid="enroll-forward" className={input}
                placeholder="https://neighbor.basicbenefits.com/member-enrollment?agent_code={id}" />
            </label>
            <fieldset>
              <legend>Printed on the flyers</legend>
              <label className="mt-1 flex min-h-11 items-center gap-2">
                <input type="radio" name="printed" checked={draft.printed === "short"} onChange={() => setDraft({ ...draft, printed: "short" })} data-testid="enroll-printed-short" />
                A short address
              </label>
              {draft.printed === "short" && (
                <input value={draft.printedTemplate ?? ""} onChange={(e) => setDraft({ ...draft, printedTemplate: e.target.value })} data-testid="enroll-printed-template" aria-label="Short printed address"
                  className={input} placeholder="join.basicbenefits.com/{id}" />
              )}
              <label className="mt-1 flex min-h-11 items-center gap-2">
                <input type="radio" name="printed" checked={draft.printed === "code"} onChange={() => setDraft({ ...draft, printed: "code" })} data-testid="enroll-printed-code" />
                The agent&apos;s OneFlyer link: <span className="font-mono">oneflyer.org/a/&lt;code&gt;</span> (forwards like the QR)
              </label>
            </fieldset>
            <label>
              Program page (unknown or inactive agents)
              <input value={draft.programUrl} onChange={(e) => setDraft({ ...draft, programUrl: e.target.value })} data-testid="enroll-program" className={input} placeholder="https://neighbor.basicbenefits.com/" />
            </label>
            <div>
              <button type="submit" disabled={busy !== null} className="min-h-11 rounded-lg border border-border px-4 disabled:opacity-50" data-testid="enroll-save">{busy === "save" ? "Checking (up to a minute)…" : "Check and save"}</button>
            </div>
          </form>
          <p className="mt-1 text-muted-foreground">basicbenefits.com addresses only. Saved only if the forward URL, the short address and the program page load now, and the printed address fits both kits.</p>
          {result && (
            <div role="status" data-testid="enroll-domain-result" className={"mt-3 " + (result.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
              <p>{result.message}</p>
              {result.checks.length > 0 && <CheckList checks={result.checks} />}
              {result.pages.length > 0 && <PageList pages={result.pages} />}
              {result.warning && (
                <button type="button" onClick={() => void save(true)} disabled={busy !== null} className="mt-2 min-h-11 rounded-lg border border-border px-3 font-medium" data-testid="enroll-save-anyway">
                  Save anyway
                </button>
              )}
            </div>
          )}
          {data.log.length > 0 && (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2">Changes ({data.log.length})</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {data.log.map((l) => (
                  <li key={l.at} className="break-all">
                    {new Date(l.at).toLocaleString()} by {l.admin}: {l.to.forwardTemplate}, printed {l.to.printed === "code" ? "oneflyer.org/a/<code>" : l.to.printedTemplate}, program {l.to.programUrl}
                    {l.savedDespiteWarning && <span className="text-muted-foreground"> (saved despite the page warning)</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.domainLog.length > 0 && (
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2">Earlier domain changes ({data.domainLog.length})</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {data.domainLog.map((l) => <li key={l.at}>{new Date(l.at).toLocaleString()}: {l.from} → {l.to} by {l.admin}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
