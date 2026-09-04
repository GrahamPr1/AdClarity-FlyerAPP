"use client"

import { useEffect, useRef, useState } from "react"
import { ANNUAL_DISCOUNT_PERCENT } from "@/lib/types"
import type { BillingInterval, PlanId } from "@/lib/types"

/**
 * Early Access signup, shown instead of checkout while Stripe isn't wired up.
 *
 * Joining never changes anyone's plan — it records intent and nothing else.
 * The annual option describes the SAME discount already published across the
 * site; no extra incentive is offered here, because one that only exists in a
 * modal is one nobody can hold us to later.
 */
export function WaitlistModal({
  plan,
  planLabel,
  monthlyFee,
  annualMonthlyFee,
  signedInEmail,
  onClose,
}: {
  plan: Extract<PlanId, "basic" | "pro">
  planLabel: string
  monthlyFee: number
  annualMonthlyFee: number
  /** Pre-fills and locks nothing — they can still correct it. Null when anonymous. */
  signedInEmail: string | null
  onClose: () => void
}) {
  const [email, setEmail] = useState(signedInEmail ?? "")
  const [interval, setInterval] = useState<BillingInterval>("monthly")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ alreadyExists: boolean } | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Escape closes, and focus starts inside the dialog rather than wherever the
  // page happened to be.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    dialogRef.current?.focus()
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), desiredPlan: plan, billingInterval: interval }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.message ?? "Something went wrong.")
        return
      }
      setDone({ alreadyExists: !!json.alreadyExists })
    } catch {
      setError("Couldn't reach the server — check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const field =
    "w-full rounded-lg bg-[var(--surface-soft)] border border-border px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-[var(--brand-teal-bright)] focus:ring-1 focus:ring-[var(--brand-teal-bright)] transition-colors"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* items-end on mobile so it behaves like a sheet and can never overflow
          off the top; max-h + overflow-y so a small screen scrolls the dialog
          rather than the page behind it. */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Join ${planLabel} Early Access`}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 outline-none"
      >
        {done ? (
          <>
            <h2 className="text-lg">
              {done.alreadyExists ? "You're already on the list." : "You're on the list."}
            </h2>
            {signedInEmail ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                We&apos;ve started you on the free tier so you can use OneFlyer right away. You&apos;ll
                get an email with a checkout link when {planLabel} billing goes live.
              </p>
            ) : (
              // Anonymous: nothing has been created for them, so we don't
              // claim otherwise. Their place is held; the account is theirs
              // to make.
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                We&apos;ll email {email} with a checkout link when {planLabel} billing goes live.
                You don&apos;t have to wait — the free tier is open now, no card needed.
              </p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              {!signedInEmail && (
                <a
                  href="/onboarding"
                  className="rounded-xl bg-[var(--brand-teal-bright)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)]"
                >
                  Start free now
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 className="text-lg">Join {planLabel} Early Access</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Billing isn&apos;t switched on yet. Leave your email and we&apos;ll send a checkout
              link the day it is — nothing is charged now.
            </p>

            <div className="mt-5">
              <label htmlFor="wl-email" className="block text-sm font-medium mb-1.5">Email</label>
              <input id="wl-email" type="email" required className={field} value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
            </div>

            <div className="mt-4">
              <span className="block text-sm font-medium mb-1.5">Plan</span>
              <p className="rounded-lg border border-border bg-[var(--surface-soft)] px-3.5 py-2.5 text-sm">{planLabel}</p>
            </div>

            <fieldset className="mt-4">
              <legend className="block text-sm font-medium mb-1.5">Billing</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["monthly", "annual"] as const).map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors ${
                      interval === opt ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)]" : "border-border hover:border-[var(--brand-slate)]"
                    }`}
                  >
                    <input type="radio" name="billing" value={opt} checked={interval === opt}
                      onChange={() => setInterval(opt)} className="mt-0.5 h-4 w-4 accent-[var(--brand-teal-bright)]" />
                    <span>
                      <span className="block text-sm font-medium">{opt === "monthly" ? "Monthly" : "Annual"}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {opt === "monthly"
                          ? `$${monthlyFee}/mo`
                          : `$${annualMonthlyFee}/mo — save ${ANNUAL_DISCOUNT_PERCENT}%`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

            <div className="mt-6 flex flex-wrap gap-3">
              <button type="submit" disabled={submitting || !email.trim()}
                className="rounded-xl bg-[var(--brand-teal-bright)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-50">
                {submitting ? "Joining…" : "Join Early Access"}
              </button>
              <button type="button" onClick={onClose}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
