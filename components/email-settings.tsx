"use client"

import useSWR from "swr"
import { useState } from "react"
import { fetcher } from "@/lib/swr-fetcher"
import type { EmailPreferences, LeadEmailMode } from "@/lib/email-preferences"

const LEAD_OPTIONS: { value: LeadEmailMode; label: string; hint: string }[] = [
  { value: "instant", label: "Each new lead", hint: "An email as soon as someone fills in your offer page" },
  { value: "off", label: "Off", hint: "No lead emails — they stay in your dashboard" },
]

/**
 * Email settings on /profile, next to Appearance. The same choices the
 * unsubscribe link in every email changes, so a person can undo it here.
 */
export function EmailSettings() {
  const { data, mutate } = useSWR<{ preferences: EmailPreferences }>("/api/account/email-preferences", fetcher)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = data?.preferences

  async function save(patch: Partial<EmailPreferences>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/account/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save — please try again.")
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save — please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="emails" className="scroll-mt-8 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg tracking-tight">Emails</h2>
        {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Which emails OneFlyer sends you. Every email also has its own unsubscribe link.</p>

      <fieldset className="mt-4" disabled={!current || saving}>
        <legend className="text-sm font-medium">New-lead emails</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {LEAD_OPTIONS.map((o) => {
            const active = current?.leads === o.value
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={active}
                onClick={() => save({ leads: o.value })}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)]" : "border-border hover:bg-[var(--surface-sunken)]"
                }`}
              >
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Lead capture is part of Basic and Pro.</p>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-xs text-[var(--destructive)]">{error}</p>}
    </section>
  )
}
