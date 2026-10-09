"use client"

import { useState } from "react"
import useSWR from "swr"
import { NOP_TEMPLATES } from "@/lib/enterprise/nop-render/templates"
import type { ContentEvent } from "@/lib/enterprise/nop-render/content-store"
import type { NopAdminAction, OrgAdminRecord } from "@/lib/enterprise/org-admins"

// Sections of the NOP admin console (app/admin/enterprise/nop): flyer
// content/prices (owner and org admins), org admins and the activity log
// (site owner only). The API routes are the authority; this shows what
// they return.

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
const primaryBtn = "rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)] disabled:opacity-60"
const input = "rounded-lg border border-border bg-[var(--surface-soft)] px-3 py-1.5 text-sm"

async function send(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  return { ok: res.ok, data: await res.json().catch(() => ({})) }
}

type Prices = Record<string, Record<string, string>>
type VersionSummary = { version: string; effectiveDate: string; stamp: string; prices: Prices; uploadedBy?: string; uploadedAt?: string; note?: string }
type ContentState = { live: VersionSummary & { content: unknown }; bundled: VersionSummary; versions: VersionSummary[]; events: ContentEvent[] }

function priceLine(p: Prices) {
  return Object.entries(p).map(([pkg, k]) => `${pkg} ${k.single} / ${k.family}`).join(" · ")
}

/** One template's preview with the draft; reports success so publishing can require all 8. */
function DraftPreview({ draftId, template, onResult }: { draftId: string; template: string; onResult: (ok: boolean, error?: string) => void }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const src = `/api/admin/enterprise/nop/content/preview?draft=${encodeURIComponent(draftId)}&template=${template}`
  return (
    <figure className="rounded-lg border border-border p-2" data-testid={`draft-preview-${template}`} data-state={state}>
      <figcaption className="mb-1 text-xs text-muted-foreground">{template} {state === "loading" ? "— rendering…" : state === "ok" ? "✓" : "— failed"}</figcaption>
      {state !== "error" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${template} preview with the uploaded content`}
          className="w-full"
          onLoad={() => { setState("ok"); onResult(true) }}
          onError={async () => {
            const r = await fetch(src).then((x) => x.json()).catch(() => ({}))
            const msg = r.message ?? r.error ?? "render failed"
            setState("error"); setError(msg); onResult(false, msg)
          }}
        />
      ) : (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">{error}</p>
      )}
    </figure>
  )
}

export function ContentAdmin({ onPublished }: { onPublished?: () => void }) {
  const content = useSWR<ContentState>("/api/admin/enterprise/nop/content", fetcher, { revalidateOnFocus: false })
  const [json, setJson] = useState("")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [draft, setDraft] = useState<{ id: string; changes: string[] } | null>(null)
  const [previewOk, setPreviewOk] = useState<Record<string, boolean>>({})
  // Previews render one at a time: 8 parallel Chromium renders gain nothing.
  const [shown, setShown] = useState(1)
  const [note, setNote] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const allPreviewed = NOP_TEMPLATES.every((t) => previewOk[t])

  async function upload() {
    setBusy(true); setErrors([]); setDraft(null); setPreviewOk({}); setShown(1); setMessage(null)
    const r = await send("/api/admin/enterprise/nop/content", { json })
    setBusy(false)
    if (!r.ok) return setErrors(r.data.errors ?? [r.data.error ?? "Upload failed"])
    setDraft({ id: r.data.draftId, changes: r.data.changes })
  }

  async function publish() {
    if (!draft) return
    setBusy(true); setErrors([])
    const r = await send("/api/admin/enterprise/nop/content/publish", { draftId: draft.id, note })
    setBusy(false)
    if (!r.ok) return setErrors([r.data.error ?? "Publish failed", ...(r.data.errors ?? [])])
    setMessage(`Published ${r.data.version}. Agents get it on their next download.`)
    setDraft(null); setJson(""); setNote("")
    void content.mutate(); onPublished?.()
  }

  async function rollback(version: string) {
    setBusy(true); setErrors([]); setMessage(null)
    const r = await send("/api/admin/enterprise/nop/content/rollback", { version })
    setBusy(false)
    if (!r.ok) return setErrors([r.data.error ?? "Rollback failed"])
    setMessage(`${version} is live again.`)
    void content.mutate(); onPublished?.()
  }

  function downloadLive() {
    if (!content.data) return
    const blob = new Blob([JSON.stringify(content.data.live.content, null, 2) + "\n"], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `nop-content-${content.data.live.version}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const live = content.data?.live
  const history: VersionSummary[] = content.data ? [...content.data.versions, content.data.bundled] : []
  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-5" data-testid="content-admin">
      <h2 className="text-lg">Flyer prices and content</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload a new content.json to change prices without a code deploy. Only the prices, program.effective_date and _note can change.
        Any price change needs a later effective month, so the version stamp printed on the flyers changes too.
        Preview all 8 flyers before publishing; agents get the published version on their next download.
      </p>
      {live && (
        <div className="mt-4 text-sm" data-testid="content-live">
          <p><span className="font-medium">Live: {live.version}</span> · effective {live.effectiveDate} · stamp {live.stamp}</p>
          <p className="mt-1 text-muted-foreground">{priceLine(live.prices)}</p>
          <button type="button" className={`${btn} mt-2`} onClick={downloadLive}>Download live content.json</button>
        </div>
      )}

      <div className="mt-5">
        <input type="file" accept=".json,application/json" className="block text-sm" aria-label="Choose content.json"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setJson(await f.text()) }} />
        <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} placeholder="…or paste content.json here" aria-label="content.json"
          className="mt-3 w-full rounded-lg border border-border bg-[var(--surface-soft)] p-3 font-mono text-xs" />
        <button type="button" className={`${primaryBtn} mt-2`} disabled={busy || !json.trim()} onClick={() => void upload()}>Check upload</button>
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="mt-3 list-disc pl-5 text-sm text-red-700 dark:text-red-400" data-testid="content-errors">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}
      {message && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400" aria-live="polite">{message}</p>}

      {draft && (
        <div className="mt-5" data-testid="content-draft">
          <p className="text-sm font-medium">Valid. Changes from live:</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{draft.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="mt-3 text-sm text-muted-foreground">Previews with the uploaded content (Render Check Agent, 858980):</p>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {NOP_TEMPLATES.slice(0, shown).map((t) => (
              <DraftPreview key={`${draft.id}-${t}`} draftId={draft.id} template={t}
                onResult={(ok) => { setPreviewOk((p) => ({ ...p, [t]: ok })); setShown((n) => Math.max(n, NOP_TEMPLATES.indexOf(t) + 2)) }} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input className={`${input} min-w-64 flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (e.g. 2027 price update)" aria-label="Publish note" />
            <button type="button" className={primaryBtn} disabled={busy || !allPreviewed} onClick={() => void publish()}>
              {allPreviewed ? "Publish to agents" : `Previewing… ${Object.values(previewOk).filter(Boolean).length}/8`}
            </button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}

      {content.data && (
        <div className="mt-6">
          <h3 className="text-sm font-medium">Versions</h3>
          <ul className="mt-2 space-y-2 text-sm" data-testid="content-versions">
            {history.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2">
                <span className="font-medium">{v.version}</span>
                <span className="text-muted-foreground">effective {v.effectiveDate} · stamp {v.stamp}</span>
                <span className="text-muted-foreground">{priceLine(v.prices)}</span>
                {v.uploadedBy && <span className="text-xs text-muted-foreground">by {v.uploadedBy}{v.note ? ` — ${v.note}` : ""}</span>}
                {live?.version === v.version
                  ? <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">live</span>
                  : <button type="button" className={btn} disabled={busy} onClick={() => void rollback(v.version)}>Make live again</button>}
              </li>
            ))}
          </ul>
          {content.data.events.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-medium">Publish history</h3>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {content.data.events.map((e) => (
                  <li key={`${e.at}-${e.version}`}>{new Date(e.at).toLocaleString()} — {e.type === "publish" ? "published" : "rolled back to"} {e.version} (was {e.from}) by {e.actor}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export function OrgAdminsAdmin() {
  const data = useSWR<{ admins: OrgAdminRecord[]; actions: NopAdminAction[] }>("/api/admin/enterprise/nop/org-admins", fetcher, { revalidateOnFocus: false })
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(method: "POST" | "DELETE", target: string) {
    setBusy(true); setMsg(null)
    const r = await send("/api/admin/enterprise/nop/org-admins", { email: target }, method)
    setBusy(false)
    if (!r.ok) return setMsg(r.data.error ?? "Failed")
    setMsg(method === "POST" ? (r.data.invited ? `Added ${target} and emailed the invite.` : `Added ${target}, but the invite email failed; send them the sign-in link.`) : `Removed ${target}; they are signed out.`)
    if (method === "POST") setEmail("")
    void data.mutate()
  }

  return (
    <>
      <section className="mt-10 rounded-xl border border-border bg-card p-5" data-testid="org-admins">
        <h2 className="text-lg">Basic Benefits admins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Org admins sign in at /admin/enterprise/nop/sign-in with an emailed code and can use this page only — no business customers or other admin pages. Only you can add or remove them.
        </p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void act("POST", email.trim()) }}>
          <input type="email" className={`${input} min-w-64`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@basicbenefits.com" aria-label="Org admin email" />
          <button type="submit" className={primaryBtn} disabled={busy || !email.trim()}>Add and invite</button>
        </form>
        {msg && <p className="mt-2 text-sm" aria-live="polite">{msg}</p>}
        {data.data && data.data.admins.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No org admins yet.</p>}
        {data.data && data.data.admins.length > 0 && (
          <ul className="mt-3 space-y-2 text-sm">
            {data.data.admins.map((a) => (
              <li key={a.email} className="flex flex-wrap items-center gap-3 border-t border-border pt-2">
                <span className="font-medium break-all">{a.email}</span>
                <span className="text-xs text-muted-foreground">added {new Date(a.invitedAt).toLocaleDateString()} · {a.lastSignInAt ? `last sign-in ${new Date(a.lastSignInAt).toLocaleString()}` : "not signed in yet"}</span>
                <button type="button" className={btn} disabled={busy} onClick={() => void act("DELETE", a.email)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-10" data-testid="admin-actions">
        <h2 className="text-lg">Console activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Who did what on this page (newest 200).</p>
        {data.data && data.data.actions.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nothing yet.</p>}
        {data.data && data.data.actions.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {data.data.actions.map((a, i) => (
              <li key={`${a.at}-${i}`}><span className="text-muted-foreground">{new Date(a.at).toLocaleString()}</span> — {a.actor}: {a.action.replace(/_/g, " ")}{a.detail ? ` — ${a.detail}` : ""}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
