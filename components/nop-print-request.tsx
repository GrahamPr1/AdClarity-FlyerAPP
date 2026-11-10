"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useNop } from "@/components/nop-i18n"

const field = "mt-1 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"

/**
 * "Request printed copies" on a flyer's page (Pro). Not an order: nothing is
 * printed or charged here; an admin emails a quote first (print-requests.ts).
 */
export function NopPrintRequest({ template, readOnly }: { template: string; readOnly: boolean }) {
  const { t } = useNop()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ quantity: "50", shippingName: "", shippingAddress: "", notes: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await fetch("/api/enterprise/agent/print-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template, ...v, quantity: Number(v.quantity) }) }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) return setError(body.message ?? t("common.generic"))
    setSent(true); setOpen(false)
    router.refresh()
  }

  return (
    <section aria-labelledby="print" data-testid="print-request" className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 id="print" className="font-semibold">{t("print.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("print.intro")}</p>
      {sent && <p role="status" data-testid="print-sent" className="mt-3 text-sm font-medium">{t("print.sent")}</p>}
      {!open ? (
        !readOnly && <button type="button" data-testid="print-open" onClick={() => { setOpen(true); setSent(false) }} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-[var(--surface-sunken)]">{t("print.title")}</button>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3" data-testid="print-form">
          <label className="text-sm font-medium">{t("print.quantity")}<input id="print-quantity" type="number" inputMode="numeric" min={1} max={500} className={`${field} w-32`} value={v.quantity} onChange={set("quantity")} /></label>
          <label className="text-sm font-medium">{t("print.ship_name")}<input id="print-name" className={field} maxLength={80} autoComplete="name" value={v.shippingName} onChange={set("shippingName")} /></label>
          <label className="text-sm font-medium">{t("print.ship_address")}<textarea id="print-address" rows={3} className={field} maxLength={300} autoComplete="street-address" value={v.shippingAddress} onChange={set("shippingAddress")} /></label>
          <label className="text-sm font-medium">{t("print.notes")}<textarea id="print-notes" rows={2} className={field} maxLength={500} value={v.notes} onChange={set("notes")} /></label>
          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} data-testid="print-submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-teal-bright)] px-4 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60">{t("print.submit")}</button>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium">{t("print.cancel")}</button>
          </div>
        </form>
      )}
    </section>
  )
}
