"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"
import type { NopStringKey } from "@/lib/enterprise/nop-i18n"

export interface EmailToggleText {
  title: NopStringKey
  label: NopStringKey
  on: NopStringKey
  off: NopStringKey
}

/** Profile: one of the agent's own emails (monthly results, daily follow-up reminder), on or off. */
export function NopEmailToggle({ on, readOnly, endpoint, text, testId }: { on: boolean; readOnly: boolean; endpoint: string; text: EmailToggleText; testId: string }) {
  const { t } = useNop()
  const [value, setValue] = useState(on)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function change(next: boolean) {
    setBusy(true); setMsg(null)
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: next }) }).catch(() => null)
    setBusy(false)
    if (res?.ok) { setValue(next); setMsg(t(next ? text.on : text.off)) }
    else setMsg(t("common.generic"))
  }
  return (
    <section aria-labelledby={testId} data-testid={testId} className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 id={testId} className="font-semibold">{t(text.title)}</h2>
      <label className="mt-2 flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={value} disabled={busy || readOnly} onChange={(e) => void change(e.target.checked)} data-testid={`${testId}-checkbox`} />
        {t(text.label)}
      </label>
      {msg && <p role="status" className="mt-1 text-sm text-muted-foreground">{msg}</p>}
    </section>
  )
}

/** Profile: the monthly results email (monthly-email.ts). */
export function NopMonthlyEmailToggle({ on, readOnly }: { on: boolean; readOnly: boolean }) {
  return <NopEmailToggle on={on} readOnly={readOnly} endpoint="/api/enterprise/agent/monthly-email" testId="monthly-toggle"
    text={{ title: "monthly.toggle_title", label: "monthly.toggle_label", on: "monthly.toggle_on", off: "monthly.toggle_off" }} />
}

/** Profile: the daily follow-up reminder (followup-reminders.ts). */
export function NopFollowUpReminderToggle({ on, readOnly }: { on: boolean; readOnly: boolean }) {
  return <NopEmailToggle on={on} readOnly={readOnly} endpoint="/api/enterprise/agent/followup-reminders" testId="followup-toggle"
    text={{ title: "followup.toggle_title", label: "followup.toggle_label", on: "followup.toggle_on", off: "followup.toggle_off" }} />
}
