"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Pause / resume, and an honest account section.
 *
 * Pause exists so that "I need a break" has an answer that isn't "cancel and
 * lose everything". It is shown BEFORE any cancellation path rather than as a
 * footnote underneath one — someone deciding whether to leave should see the
 * lower-commitment option while they're still deciding.
 *
 * Nothing here deletes anything, and the copy says so plainly, because the
 * fear that stops people pausing is that it's cancellation by another name.
 */
export function AccountStatus() {
  const { data, mutate, isLoading } = useSWR<{
    pausedAt?: string | null
    planName?: string
    hasBillingAccount?: boolean
    subscriptionEndsAt?: string | null
  }>(
    "/api/deliverables",
    fetcher,
    { revalidateOnFocus: false },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const paused = !!data?.pausedAt
  const [openingPortal, setOpeningPortal] = useState(false)
  // /checkout lands here with ?billing=error when Stripe couldn't be reached.
  const checkoutFailed = useSearchParams().get("billing") === "error"

  // Card, plan switch, cancellation and invoices all live in Stripe's
  // Customer Portal. Whatever changes there comes back via the webhook.
  async function openBillingPortal() {
    setOpeningPortal(true)
    setError(null)
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.url) {
        setError(json.error ?? "Couldn't open billing right now.")
        setOpeningPortal(false)
        return
      }
      window.location.assign(json.url)
    } catch {
      setError("Couldn't open billing right now.")
      setOpeningPortal(false)
    }
  }

  async function setPaused(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/account/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.message ?? json.error ?? "Something went wrong.")
        return
      }
      setConfirming(false)
      await mutate()
    } catch {
      setError("Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-12 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-lg">Your account</h2>

      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : paused ? (
        <>
          <p className="mt-2 text-sm text-amber-300">
            Paused since {new Date(data!.pausedAt as string).toLocaleDateString()}.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Nothing was deleted. Your brand details, every flyer you&apos;ve made, and all your QR
            scan history are exactly where you left them — and QR codes on flyers already out in
            the world are still working. You just can&apos;t start new campaigns while paused.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPaused(false)}
            className="mt-4 rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-50"
          >
            {busy ? "Resuming…" : "Resume my account"}
          </button>
        </>
      ) : !confirming ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Need a break? Pausing stops new campaigns without deleting anything — your brand
            details, your flyers, and your QR tracking history all stay put, so picking back up
            later isn&apos;t starting over.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Pause my account
          </button>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-[var(--surface-soft)] p-4">
          <p className="text-sm font-medium">Pause, rather than cancel?</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
            <li>· Billing stops. You keep the account.</li>
            <li>· Your brand profile and every flyer you&apos;ve generated are kept.</li>
            <li>· QR codes already printed keep working, and keep counting scans.</li>
            <li>· Resume whenever you want — nothing to set up again.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPaused(true)}
              className="rounded-lg bg-[var(--brand-teal-bright)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] transition-colors hover:bg-[var(--brand-teal)] disabled:opacity-50"
            >
              {busy ? "Pausing…" : "Pause my account"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Never mind
            </button>
          </div>
          <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {data?.hasBillingAccount
              ? "Want to cancel your plan instead? Use Manage billing below — you keep access until the end of the period you've paid for. "
              : null}
            To close the account entirely, email{" "}
            <a href="mailto:support@oneflyer.org" className="text-[var(--brand-teal-bright)] hover:underline">
              support@oneflyer.org
            </a>{" "}
            and we&apos;ll handle it — see our{" "}
            <a href="/refund-policy" className="text-[var(--brand-teal-bright)] hover:underline">
              cancellation policy
            </a>{" "}
            for exactly what happens to your data.
          </p>
        </div>
      )}

      {!isLoading && data?.hasBillingAccount && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-medium">Billing</h3>
          {data.subscriptionEndsAt && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your {data.planName} plan is cancelled and ends on{" "}
              {new Date(data.subscriptionEndsAt).toLocaleDateString()}. You can keep using it until then.
            </p>
          )}
          <p className="mt-1.5 text-sm text-muted-foreground">
            Update your card, switch plans, download invoices or cancel.
          </p>
          <button
            type="button"
            disabled={openingPortal}
            onClick={openBillingPortal}
            className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            {openingPortal ? "Opening…" : "Manage billing"}
          </button>
        </div>
      )}

      {checkoutFailed && !error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          We couldn&apos;t start checkout. Nothing was charged — please try again in a moment.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  )
}
