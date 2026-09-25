"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr-fetcher"
import type { EditableField, EditRejection } from "@/lib/agent-pipeline/flyer-edit"

/**
 * Direct field editing for one generated flyer.
 *
 * Text only, applied instantly, no model call — a client fixing a typo in a
 * phone number should not wait fifteen seconds or risk the rest of the page
 * being rewritten around their correction.
 *
 * The character budget is shown live and enforced by the server against the
 * value carried in the flyer's own markup, so the limit the editor reports
 * is the same one the generator used. That is what keeps an edit from doing
 * what generation is prevented from doing: overflowing a fixed-size layout.
 *
 * A flyer generated before the markers existed reports notSupported, and
 * this renders a pointer to the AI refine path rather than an editor whose
 * saves would silently do nothing.
 */
export function FlyerEditPanel({ flyerId, onSaved }: { flyerId: string; onSaved: () => void }) {
  const { data, isLoading, mutate } = useSWR<{
    notSupported: boolean
    reason?: string
    fields: EditableField[]
    canRevert?: boolean
  }>(`/api/flyers/${flyerId}/edit`, fetcher)

  if (isLoading) return <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
  if (!data) return null

  if (data.notSupported) {
    return (
      <div className="mt-3 rounded-lg border border-border bg-[var(--surface-soft)] p-3">
        <p className="text-xs text-muted-foreground">
          {data.reason === "pre_marker"
            ? "This flyer was made before direct editing existed, so its text can't be edited in place."
            : "This flyer has no editable text."}{" "}
          You can still change it by regenerating with an instruction.
        </p>
      </div>
    )
  }

  return <Editor key={data.fields.map((f) => f.value).join("|")} flyerId={flyerId} initial={data.fields}
    canRevert={!!data.canRevert} onSaved={() => { void mutate(); onSaved() }} />
}

function Editor({
  flyerId,
  initial,
  canRevert,
  onSaved,
}: {
  flyerId: string
  initial: EditableField[]
  canRevert: boolean
  onSaved: () => void
}) {
  // Keyed on the current values by the parent, so a save reseeds cleanly
  // without an effect — same pattern as BusinessProfileForm.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((f) => [f.field, f.value])),
  )
  const [saving, setSaving] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [rejected, setRejected] = useState<EditRejection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = initial.some((f) => (values[f.field] ?? "") !== f.value)
  const overBudget = initial.some((f) => (values[f.field] ?? "").trim().length > f.max)

  async function save() {
    setSaving(true); setError(null); setRejected([]); setSaved(false)
    try {
      const res = await fetch(`/api/flyers/${flyerId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: values }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 422) { setRejected(body?.rejected ?? []); return }
      if (!res.ok) { setError(body?.error ?? "Couldn't save that change."); return }
      if (body?.rejected?.length) setRejected(body.rejected)
      setSaved(true)
      onSaved()
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  async function revert() {
    setReverting(true); setError(null)
    try {
      const res = await fetch(`/api/flyers/${flyerId}/edit?action=revert`, { method: "POST" })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? "Couldn't undo."); return }
      onSaved()
    } finally {
      setReverting(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-[var(--surface-soft)] p-3">
      <div className="flex flex-col gap-2.5">
        {initial.map((f) => {
          const v = values[f.field] ?? ""
          const len = v.trim().length
          const over = len > f.max
          const long = v.length > 60
          return (
            <div key={f.field}>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={`edit-${flyerId}-${f.field}`} className="text-[11px] font-medium capitalize">
                  {f.field}
                </label>
                <span className={`text-[10px] ${over ? "text-[var(--destructive)]" : "text-muted-foreground"}`}>
                  {len}/{f.max}
                </span>
              </div>
              {long ? (
                <textarea
                  id={`edit-${flyerId}-${f.field}`} rows={2} value={v}
                  onChange={(e) => setValues({ ...values, [f.field]: e.target.value })}
                  aria-invalid={over}
                  className={`mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs leading-snug outline-none ${over ? "border-[var(--destructive)]" : "border-border"}`}
                />
              ) : (
                <input
                  id={`edit-${flyerId}-${f.field}`} value={v}
                  onChange={(e) => setValues({ ...values, [f.field]: e.target.value })}
                  aria-invalid={over}
                  className={`mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none ${over ? "border-[var(--destructive)]" : "border-border"}`}
                />
              )}
            </div>
          )
        })}
      </div>

      {rejected.length > 0 && (
        <ul role="alert" className="mt-2.5 space-y-1">
          {rejected.map((r) => (
            <li key={r.field} className="text-[11px] text-[var(--destructive)]">{r.message}</li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2.5 text-[11px] text-[var(--destructive)]">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void save()}
          disabled={saving || !dirty || overBudget}
          className="rounded-md bg-[var(--brand-teal-bright)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {canRevert && (
          <button
            onClick={() => void revert()}
            disabled={reverting}
            className="rounded-md border border-border px-3 py-1.5 text-xs transition-colors hover:bg-background disabled:opacity-60"
          >
            {reverting ? "Undoing…" : "Undo last edit"}
          </button>
        )}
        {saved && <span className="text-[11px] text-muted-foreground">Saved.</span>}
        {overBudget && (
          <span className="text-[11px] text-muted-foreground">
            Shorten the highlighted field — this layout can&apos;t fit more.
          </span>
        )}
      </div>
    </div>
  )
}
