"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr-fetcher"
import { OfferPageCard } from "@/components/offer-page-card"
import { OFFER_PAGE_LIMITS, type OwnerOfferContent } from "@/lib/offer-page-content"

interface OfferPageData {
  content: OwnerOfferContent
  businessName: string
  website: string | null
  disclaimer: string | null
  code: string
  qrUrl: string
  edited: boolean
  expired: boolean
  canEdit: boolean
  canUndo: boolean
}

/**
 * Edits what a flyer's QR code opens, with the real page as a live preview.
 * The QR code and its link never change; only the words on the page do.
 * Saving, undo and reset are refused by the server without an active paid
 * plan; the controls here just don't offer them.
 */
export function OfferPageEditor({ flyerId }: { flyerId: string }) {
  const { data, error, mutate } = useSWR<OfferPageData>(`/api/offer-page/${flyerId}`, fetcher)
  if (error) return <p className="text-sm text-muted-foreground">This flyer has no offer page to edit.</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  // Keyed on the saved content, so a save, undo or reset reloads the form.
  return <Editor key={JSON.stringify(data.content) + data.edited} flyerId={flyerId} data={data} reload={() => void mutate()} />
}

function Editor({ flyerId, data, reload }: { flyerId: string; data: OfferPageData; reload: () => void }) {
  const [form, setForm] = useState<OwnerOfferContent>(data.content)
  const [busy, setBusy] = useState<null | "save" | "undo" | "reset">(null)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const set = <K extends keyof OwnerOfferContent>(k: K, v: OwnerOfferContent[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = JSON.stringify(form) !== JSON.stringify(data.content)

  const field =
    "block w-full min-h-11 rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors disabled:opacity-60"

  async function send(kind: "save" | "undo" | "reset") {
    setBusy(kind)
    setMessage(null)
    try {
      const res =
        kind === "save"
          ? await fetch(`/api/offer-page/${flyerId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
          : await fetch(`/api/offer-page/${flyerId}?action=${kind}`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ kind: "error", text: json.message ?? "That didn't save. Try again." })
        return
      }
      reload()
    } catch {
      setMessage({ kind: "error", text: "That didn't save. Check your connection and try again." })
    } finally {
      setBusy(null)
    }
  }

  const text = (k: "headline" | "offer" | "price" | "cta", label: string, hint?: string) => {
    const value = form[k] ?? ""
    const max = OFFER_PAGE_LIMITS[k]
    const over = value.length > max
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={`op-${k}`} className="text-sm font-medium">{label}</label>
          <span className={`text-xs tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{value.length}/{max}</span>
        </div>
        {k === "offer" ? (
          <textarea id={`op-${k}`} rows={3} className={field} value={value} disabled={!data.canEdit}
            onChange={(e) => set(k, e.target.value || null)} />
        ) : (
          <input id={`op-${k}`} className={field} value={value} disabled={!data.canEdit}
            onChange={(e) => set(k, (k === "headline" || k === "cta" ? e.target.value : e.target.value || null) as never)} />
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    )
  }

  const overLimit = (["headline", "offer", "price", "cta"] as const).some((k) => (form[k] ?? "").length > OFFER_PAGE_LIMITS[k])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="flex flex-col gap-5">
        {!data.canEdit && (
          <div className="rounded-lg border border-border bg-[var(--surface-soft)] p-4 text-sm">
            <p className="font-medium">Editing your offer page is part of Basic and Pro.</p>
            <p className="mt-1 text-muted-foreground">If your account is paused, resume it from your profile to edit. Your QR code keeps working either way.</p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Changes go live on your offer page as soon as you save. Your QR code stays the same, so printed flyers keep working:{" "}
          <span className="break-all font-medium text-foreground">{data.qrUrl}</span>
        </p>

        {text("headline", "Headline")}
        {text("price", "Price or discount", "Optional. Shown large, like “$49” or “20% off”.")}
        {text("offer", "Offer details", "Optional.")}
        <div>
          <label htmlFor="op-expiresAt" className="mb-1.5 block text-sm font-medium">Offer ends</label>
          <div className="flex items-center gap-3">
            <input id="op-expiresAt" type="date" className={`${field} max-w-[12rem]`} value={form.expiresAt ?? ""} disabled={!data.canEdit}
              onChange={(e) => set("expiresAt", e.target.value || null)} />
            {form.expiresAt && data.canEdit && (
              <button type="button" onClick={() => set("expiresAt", null)} className="min-h-11 text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)]">
                No end date
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Optional. After this date the page says the offer has ended and shows your phone number.</p>
        </div>
        {text("cta", "Button label")}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="op-phone" className="text-sm font-medium">Phone number the button calls</label>
            <span className="text-xs tabular-nums text-muted-foreground">{form.phone.length}/{OFFER_PAGE_LIMITS.phone}</span>
          </div>
          <input id="op-phone" type="tel" className={field} value={form.phone} disabled={!data.canEdit} maxLength={OFFER_PAGE_LIMITS.phone}
            onChange={(e) => set("phone", e.target.value)} />
        </div>

        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
            {message.text}
          </p>
        )}

        {data.canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void send("save")} disabled={!dirty || overLimit || busy !== null}
              className="min-h-11 rounded-xl bg-[var(--brand-teal-bright)] px-6 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-50">
              {busy === "save" ? "Saving…" : "Save changes"}
            </button>
            {data.canUndo && (
              <button type="button" onClick={() => void send("undo")} disabled={busy !== null}
                className="min-h-11 rounded-xl border border-border px-4 text-sm transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-50">
                {busy === "undo" ? "Undoing…" : "Undo last change"}
              </button>
            )}
            {data.edited && (
              <button type="button" onClick={() => void send("reset")} disabled={busy !== null}
                className="min-h-11 rounded-xl border border-border px-4 text-sm transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-50">
                {busy === "reset" ? "Resetting…" : "Reset offer page to match flyer"}
              </button>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Live preview</p>
        <div className="flex justify-center rounded-2xl bg-background p-4 ring-1 ring-border">
          <OfferPageCard
            preview
            code={data.code}
            businessName={data.businessName}
            headline={form.headline || null}
            offer={form.offer}
            price={form.price}
            expiresAt={form.expiresAt}
            cta={form.cta || null}
            phone={form.phone}
            website={data.website}
            disclaimer={data.disclaimer}
          />
        </div>
      </div>
    </div>
  )
}
