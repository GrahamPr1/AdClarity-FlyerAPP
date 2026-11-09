"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"

// Agent Pro billing buttons. Each opens Stripe (Checkout or the Customer
// Portal) in this tab; the server decides who may buy, and Pro is granted
// only by the webhook once Stripe confirms payment.

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--brand-teal)] disabled:opacity-60 transition-colors"
const outline =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-60 transition-colors"

function useOpen(path: string) {
  const { t } = useNop()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function open() {
    setBusy(true)
    setError(null)
    const res = await fetch(path, { method: "POST" }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok && body.url) {
      window.location.assign(body.url)
      return
    }
    setBusy(false)
    setError(t("portal.billing_error"))
  }
  return { busy, error, open }
}

export function UpgradeToPro({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useNop()
  const { busy, error, open } = useOpen("/api/enterprise/agent/billing/checkout")
  return (
    <div className="flex flex-col gap-2">
      <button type="button" data-testid="upgrade-pro" disabled={busy || readOnly} title={readOnly ? t("portal.read_only") : undefined} onClick={() => void open()} className={primary}>
        {t("portal.upgrade_button")}
      </button>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  )
}

export function ManageBilling({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useNop()
  const { busy, error, open } = useOpen("/api/enterprise/agent/billing/portal")
  return (
    <div className="flex flex-col gap-2">
      <button type="button" data-testid="manage-billing" disabled={busy || readOnly} title={readOnly ? t("portal.read_only") : undefined} onClick={() => void open()} className={outline}>
        {t("portal.manage_billing")}
      </button>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  )
}
