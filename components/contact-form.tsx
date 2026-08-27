"use client"

import { useState } from "react"

export function ContactForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field =
    "w-full rounded-lg bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.message ?? "Something went wrong.")
        return
      }
      setSent(true)
    } catch {
      setError("Something went wrong. Email support@oneflyer.org directly and we'll pick it up.")
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6">
        <p className="font-medium text-emerald-200">Message sent.</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We reply within one business day. If it&apos;s urgent, email{" "}
          <a href="mailto:support@oneflyer.org" className="text-[var(--brand-teal-bright)] hover:underline">
            support@oneflyer.org
          </a>{" "}
          directly.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="c-name" className="block text-sm font-medium mb-1.5">Your name</label>
        <input id="c-name" className={field} value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </div>
      <div>
        <label htmlFor="c-email" className="block text-sm font-medium mb-1.5">Your email</label>
        <input id="c-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
        <p className="mt-1.5 text-xs text-muted-foreground">So we can reply — we don&apos;t add you to anything.</p>
      </div>
      <div>
        <label htmlFor="c-message" className="block text-sm font-medium mb-1.5">How can we help?</label>
        <textarea id="c-message" rows={6} className={field} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} maxLength={4000} />
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={sending || !name.trim() || !email.trim() || message.trim().length < 10}
        className="self-start rounded-xl bg-[var(--brand-teal-bright)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send message"}
      </button>
    </form>
  )
}
