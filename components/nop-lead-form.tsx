"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"
import { LEAD_LIMITS } from "@/lib/leads"

/**
 * The form on a NOP agent's public lead page. The consent line is the org's
 * approved text, passed in verbatim, beside a checkbox that starts unticked.
 * POST /api/enterprise/nop/leads/{agentId} enforces everything; the form
 * just reports what the server said. Every control is at least 44px tall.
 */
export function NopLeadForm({ agentId, agentName, consentText, consentVersion }: { agentId: string; agentName: string; consentText: string; consentVersion: number }) {
  const { t, lang } = useNop()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [consent, setConsent] = useState(false)
  // Honeypot. Off-screen and out of the tab order; people never fill it.
  const [website, setWebsite] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field =
    "block w-full min-h-11 rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!consent) return setError(t("lead.err_consent"))
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/enterprise/nop/leads/${encodeURIComponent(agentId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, message, website, consent, consentVersion, lang }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return setError(json.message ?? t("lead.err_generic"))
      setSent(true)
    } catch {
      setError(t("lead.err_generic"))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" data-testid="lead-sent" className="mt-6 rounded-2xl border border-border bg-card p-6">
        <p className="font-semibold">{t("lead.sent", { first: name.trim().split(/\s+/)[0] })}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("lead.sent_body", { name: agentName })}</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} data-testid="lead-form" className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("lead.intro", { name: agentName })}</p>
      <div>
        <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium">{t("lead.name")}</label>
        <input id="lead-name" autoComplete="name" className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={LEAD_LIMITS.name} />
      </div>
      <div>
        <label htmlFor="lead-phone" className="mb-1.5 block text-sm font-medium">{t("lead.phone")}</label>
        <input id="lead-phone" type="tel" inputMode="tel" autoComplete="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={LEAD_LIMITS.phone} />
      </div>
      <div>
        <label htmlFor="lead-email" className="mb-1.5 block text-sm font-medium">{t("lead.email_optional")}</label>
        <input id="lead-email" type="email" autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={LEAD_LIMITS.email} />
      </div>
      <div>
        <label htmlFor="lead-message" className="mb-1.5 block text-sm font-medium">{t("lead.message_optional")}</label>
        <textarea id="lead-message" rows={3} className={field} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={LEAD_LIMITS.message} />
      </div>
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" data-testid="lead-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-teal-bright)]" />
        <span className="whitespace-pre-wrap">{consentText}</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={sending} className="min-h-12 rounded-lg bg-[var(--brand-teal-bright)] px-5 font-semibold text-[var(--primary-foreground)] disabled:opacity-60">
        {sending ? t("lead.sending") : t("lead.submit")}
      </button>
    </form>
  )
}
