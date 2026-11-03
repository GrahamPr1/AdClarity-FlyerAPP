"use client"

import { useState } from "react"
import { LEAD_LIMITS } from "@/lib/leads"

/**
 * The form on a flyer's offer page (/r/<code>). Rendered only when the owner's
 * plan includes it, but POST /api/leads/<code> is what enforces that.
 *
 * Submits with fetch and swaps itself for a confirmation, so a visitor never
 * lands on an error page. Every control is at least 44px tall for thumbs.
 *
 * On an ended offer it asks for a quote instead, and the consent line covers
 * the business's services rather than an offer that no longer runs.
 */
export function LeadForm({ code, businessName, offerEnded = false }: { code: string; businessName: string; offerEnded?: boolean }) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  // Honeypot. Off-screen and out of the tab order; people never fill it.
  const [website, setWebsite] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field =
    "block w-full min-h-11 rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, message, website }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.message ?? "That didn't go through. Try again, or call instead.")
        return
      }
      setSent(true)
    } catch {
      setError("That didn't go through. Check your connection and try again, or call instead.")
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="mt-6 rounded-xl border border-border bg-[var(--surface-soft)] p-5 text-left">
        <p className="font-medium text-foreground">Thanks, {name.trim().split(/\s+/)[0]}. Your details are on their way.</p>
        <p className="mt-1.5 text-sm text-muted-foreground">{businessName} will contact you {offerEnded ? "soon" : "about this offer"}.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4 text-left">
      {offerEnded ? (
        <p className="text-sm font-medium text-foreground">Request a quote</p>
      ) : (
        <p className="text-sm font-medium text-foreground">Or leave your details and they&apos;ll get back to you</p>
      )}
      <div>
        <label htmlFor="lead-name" className="block text-sm font-medium mb-1.5">Name</label>
        <input id="lead-name" name="name" autoComplete="name" className={field} value={name}
          onChange={(e) => setName(e.target.value)} required maxLength={LEAD_LIMITS.name} />
      </div>
      <div>
        <label htmlFor="lead-phone" className="block text-sm font-medium mb-1.5">Phone</label>
        <input id="lead-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className={field} value={phone}
          onChange={(e) => setPhone(e.target.value)} required maxLength={LEAD_LIMITS.phone} />
      </div>
      <div>
        <label htmlFor="lead-email" className="block text-sm font-medium mb-1.5">
          Email <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input id="lead-email" name="email" type="email" autoComplete="email" className={field} value={email}
          onChange={(e) => setEmail(e.target.value)} maxLength={LEAD_LIMITS.email} />
      </div>
      <div>
        <label htmlFor="lead-message" className="block text-sm font-medium mb-1.5">
          Message <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea id="lead-message" name="message" rows={3} className={field} value={message}
          onChange={(e) => setMessage(e.target.value)} maxLength={LEAD_LIMITS.message} />
      </div>

      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="lead-website">Website</label>
        <input id="lead-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={sending || !name.trim() || !phone.trim()}
        className="min-h-12 w-full rounded-xl bg-[var(--brand-teal-bright)] px-6 py-3 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send my details"}
      </button>
      <p className="text-xs text-muted-foreground leading-snug">
        By submitting, you agree {businessName} may contact you about {offerEnded ? "their services" : "this offer"}.
      </p>
    </form>
  )
}
