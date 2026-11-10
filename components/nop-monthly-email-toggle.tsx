"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"

/** Profile: the agent's monthly results email, on or off (monthly-email.ts). */
export function NopMonthlyEmailToggle({ on, readOnly }: { on: boolean; readOnly: boolean }) {
  const { t } = useNop()
  const [value, setValue] = useState(on)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function change(next: boolean) {
    setBusy(true); setMsg(null)
    const res = await fetch("/api/enterprise/agent/monthly-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: next }) }).catch(() => null)
    setBusy(false)
    if (res?.ok) { setValue(next); setMsg(t(next ? "monthly.toggle_on" : "monthly.toggle_off")) }
    else setMsg(t("common.generic"))
  }
  return (
    <section aria-labelledby="monthly" data-testid="monthly-toggle" className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 id="monthly" className="font-semibold">{t("monthly.toggle_title")}</h2>
      <label className="mt-2 flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={value} disabled={busy || readOnly} onChange={(e) => void change(e.target.checked)} data-testid="monthly-checkbox" />
        {t("monthly.toggle_label")}
      </label>
      {msg && <p role="status" className="mt-1 text-sm text-muted-foreground">{msg}</p>}
    </section>
  )
}
