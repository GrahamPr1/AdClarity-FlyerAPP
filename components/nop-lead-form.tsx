"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"
import { LEAD_LIMITS } from "@/lib/leads"

/**
 * The form on a NOP agent's QR lead page, (source "page") their personal
 * page, or (source "event") an event page, where it's the RSVP: a guest
 * count, its own wording, POST /api/enterprise/nop/events/{code}/rsvp. The consent line is the org's
 * approved text, passed in verbatim, beside a checkbox that starts unticked.
 * Below it, once the org has approved its wording, an OPTIONAL second checkbox
 * for text messages (sms): also unticked, never required to submit.
 * POST /api/enterprise/nop/leads/{code} enforces everything; the form
 * just reports what the server said. Every control is at least 44px tall.
 */
export function NopLeadForm({ code, agentName, consentText, consentVersion, source, sms = null }: {
  code: string
  agentName: string
  consentText: string
  consentVersion: number
  source?: "page" | "event" | "checkin"
  /** The approved text-message consent, filled in; null while it's a placeholder (no checkbox). */
  sms?: { text: string; version: number } | null
}) {
  const { t, lang } = useNop()
  const rsvp = source === "event"
  // Check-in at an event: name and phone only (plus the consent boxes).
  const checkin = source === "checkin"
  const [guests, setGuests] = useState(0)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [consent, setConsent] = useState(false)
  const [smsOk, setSmsOk] = useState(false)
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
      const res = await fetch(checkin ? `/api/enterprise/nop/events/${encodeURIComponent(code)}/checkin` : rsvp ? `/api/enterprise/nop/events/${encodeURIComponent(code)}/rsvp` : `/api/enterprise/nop/leads/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, message, website, consent, consentVersion, lang, ...(sms ? { smsConsent: smsOk, smsConsentVersion: sms.version } : {}), ...(rsvp ? { guests } : { source }) }),
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
        <p className="font-semibold">{t(checkin ? "checkin.sent" : rsvp ? "event.rsvp_sent" : "lead.sent", { first: name.trim().split(/\s+/)[0] })}</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{checkin ? t("checkin.sent_body", { name: agentName }) : rsvp ? t("event.rsvp_sent_body") : t("lead.sent_body", { name: agentName })}</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} data-testid="lead-form" className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t(checkin ? "checkin.intro" : rsvp ? "event.rsvp_intro" : "lead.intro", { name: agentName })}</p>
      <div>
        <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium">{t("lead.name")}</label>
        <input id="lead-name" autoComplete="name" className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={LEAD_LIMITS.name} />
      </div>
      <div>
        <label htmlFor="lead-phone" className="mb-1.5 block text-sm font-medium">{t("lead.phone")}</label>
        <input id="lead-phone" type="tel" inputMode="tel" autoComplete="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={LEAD_LIMITS.phone} />
      </div>
      {!checkin && <div>
        <label htmlFor="lead-email" className="mb-1.5 block text-sm font-medium">{t("lead.email_optional")}</label>
        <input id="lead-email" type="email" autoComplete="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={LEAD_LIMITS.email} />
      </div>}
      {rsvp && (
        <div>
          <label htmlFor="rsvp-guests" className="mb-1.5 block text-sm font-medium">{t("event.guests_label")}</label>
          <select id="rsvp-guests" className={field} value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
            {Array.from({ length: 11 }, (_, n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
      {!checkin && <div>
        <label htmlFor="lead-message" className="mb-1.5 block text-sm font-medium">{t("lead.message_optional")}</label>
        <textarea id="lead-message" rows={3} className={field} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={LEAD_LIMITS.message} />
      </div>}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" data-testid="lead-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-teal-bright)]" />
        <span className="whitespace-pre-wrap"><ConsentWithPrivacyLink text={consentText} /></span>
      </label>
      {sms && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" data-testid="lead-sms" checked={smsOk} onChange={(e) => setSmsOk(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-teal-bright)]" />
          <span className="whitespace-pre-wrap">{sms.text}</span>
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={sending} className="min-h-12 rounded-lg bg-[var(--brand-teal-bright)] px-5 font-semibold text-[var(--primary-foreground)] disabled:opacity-60">
        {sending ? t("lead.sending") : t(checkin ? "checkin.submit" : rsvp ? "event.rsvp_submit" : "lead.submit")}
      </button>
    </form>
  )
}

/** "Privacy Policy" / "Política de Privacidad" in the approved wording links to the agent-pages section of the privacy page (English or Spanish). */
const PRIVACY_PHRASE = /(Privacy Policy|Política de Privacidad)/
function ConsentWithPrivacyLink({ text }: { text: string }) {
  const m = PRIVACY_PHRASE.exec(text)
  if (!m) return <>{text}</>
  return (
    <>
      {text.slice(0, m.index)}
      <a href={m[1] === "Privacy Policy" ? "/privacy#agent-pages" : "/privacy#agent-pages-es"} target="_blank" rel="noopener" data-testid="consent-privacy-link" className="underline underline-offset-2">{m[1]}</a>
      {text.slice(m.index + m[1].length)}
    </>
  )
}
