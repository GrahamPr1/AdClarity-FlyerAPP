"use client"

import { useRef, useState } from "react"
import { AiControlCenter } from "@/components/ai-control-center"
import { createNdjsonParser, type ScanEvent } from "@/lib/scan-events"
import { normalizeWebsiteUrl, displayHost } from "@/lib/url-normalize"
import type { BusinessProfile } from "@/lib/business-profile"

/**
 * "Give OneFlyer your business" — the new front door.
 *
 * Replaces a website field buried inside the guided form with a screen whose
 * only job is to turn a URL into a saved Business Profile. The old form is
 * still reachable (and still the fallback when a site can't be read); it is
 * no longer what a new client meets first.
 *
 * The scan response is a stream, so the Control Center updates as real
 * operations finish rather than after a spinner times out.
 */
export function BusinessScanFlow({
  onComplete,
  onSkip,
  onBack,
}: {
  onComplete: (profile: BusinessProfile) => void
  /** "I don't have a website" / "fill it in manually" — the old guided path. */
  onSkip: () => void
  onBack?: () => void
}) {
  const [url, setUrl] = useState("")
  const [touched, setTouched] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [events, setEvents] = useState<ScanEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  // Required details the site didn't publish. The scan still succeeded; these
  // are simply gaps the client can close here rather than being told the scan
  // failed. A missing phone is by far the most common — see the salvage path
  // in lib/agent-pipeline/scrape-site.ts.
  const [missing, setMissing] = useState<string[]>([])
  const [phone, setPhone] = useState("")
  const [savingPhone, setSavingPhone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Validated in the browser with the SAME function the server uses, so the
  // message shown before submitting can never disagree with the one after.
  const check = normalizeWebsiteUrl(url)
  const showValidation = touched && url.trim().length > 0 && !check.ok

  async function runScan() {
    if (!check.ok || scanning) return
    setScanning(true)
    setError(null)
    setEvents([])
    setProfile(null)
    setMissing([])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch("/api/business-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: check.url }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? "We couldn't start the scan. Please try again.")
        setScanning(false)
        return
      }

      const parser = createNdjsonParser((e) => {
        setEvents((prev) => [...prev, e])
        if (e.type === "complete") { setProfile(e.profile); setMissing(e.missing ?? []) }
        if (e.type === "error") setError(e.message)
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.flush()
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("We lost the connection while scanning. Please try again.")
      }
    } finally {
      setScanning(false)
      abortRef.current = null
    }
  }

  /* ----------------------------- Result ------------------------------- */
  if (profile) {
    const colors = profile.brand.colors
    const swatches = colors
      ? ([
          ["Primary", colors.primary],
          ["Secondary", colors.secondary],
          ["Accent", colors.accent],
        ] as const).filter(([, hex]) => !!hex)
      : []

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-teal-bright)]">
            Business profile saved
          </p>
          <h1 className="mt-2 text-2xl md:text-3xl tracking-tight">
            {profile.businessName || displayHost(profile.website ?? url)}
          </h1>
          {profile.description && (
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{profile.description}</p>
          )}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Website" value={profile.website} />
            <Field label="Phone" value={profile.contact.phone} />
            <Field label="Address" value={profile.contact.address} />
            <Field label="Industry" value={profile.industry} />
          </dl>

          {profile.services.length > 0 && (
            <div className="mt-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Services found</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {profile.services.map((s) => (
                  <li key={s} className="rounded-full border border-border bg-[var(--surface-soft)] px-2.5 py-1 text-xs">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-5">
            {profile.brand.logoUrl && (
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Logo</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- a remote
                    logo on an arbitrary client domain can't be added to
                    next.config's image allowlist ahead of time. */}
                <img
                  src={profile.brand.logoUrl}
                  alt=""
                  className="mt-2 h-10 max-w-[10rem] object-contain"
                  onError={(e) => { e.currentTarget.style.display = "none" }}
                />
              </div>
            )}
            {swatches.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Brand colors</p>
                <div className="mt-2 flex items-center gap-2">
                  {swatches.map(([role, hex]) => (
                    <span key={role} className="flex items-center gap-1.5 text-xs" title={`${role} ${hex}`}>
                      <span
                        className="inline-block h-6 w-6 rounded-md border border-border"
                        style={{ background: hex as string }}
                      />
                      <span className="text-muted-foreground">{hex}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {missing.includes("contact.phone") && !profile.contact.phone && (
            <div className="mt-6 rounded-xl border border-border bg-[var(--surface-soft)] p-4">
              <p className="text-sm font-medium">We couldn&apos;t find a phone number on your site</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Everything else saved fine. Add a number now and your flyers will have a way for customers to
                reach you — or skip and add it later.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label htmlFor="scan-phone" className="sr-only">Phone number</label>
                <input
                  id="scan-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(270) 555-0142"
                  className="min-w-[12rem] flex-1 rounded-xl border border-border bg-[var(--input)] px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--brand-teal-bright)]"
                />
                <button
                  type="button"
                  disabled={!phone.trim() || savingPhone}
                  onClick={async () => {
                    setSavingPhone(true)
                    try {
                      const res = await fetch("/api/profile", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ contact: { phone: phone.trim() } }),
                      })
                      const body = await res.json().catch(() => null)
                      if (res.ok && body?.profile) { setProfile(body.profile); setMissing([]) }
                    } finally {
                      setSavingPhone(false)
                    }
                  }}
                  className="pill pill-solid px-5 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingPhone ? "Saving…" : "Save number"}
                </button>
              </div>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            You can correct any of this later from your dashboard — nothing here is locked in.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => onComplete(profile)} className="pill pill-solid px-6 text-sm font-medium">
              Continue
            </button>
            <button
              type="button"
              onClick={() => { setProfile(null); setEvents([]) }}
              className="pill pill-outline border-foreground/25 px-6 text-sm"
            >
              Scan a different site
            </button>
          </div>
        </div>

        <AiControlCenter events={events} className="lg:sticky lg:top-6" />
      </div>
    )
  }

  /* ------------------------------ Input -------------------------------- */
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      <div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back
          </button>
        )}

        <h1 className="text-2xl md:text-3xl tracking-tight">Let&apos;s start with your business</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Enter your website and OneFlyer will read it — your name, services, logo, colors and contact
          details — so you never have to type them in again.
        </p>

        <label htmlFor="business-url" className="mt-6 block text-sm font-medium">
          Your website
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="business-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="yourbusiness.com"
            value={url}
            disabled={scanning}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => { if (e.key === "Enter") { setTouched(true); void runScan() } }}
            aria-invalid={showValidation}
            aria-describedby={showValidation ? "business-url-error" : "business-url-hint"}
            className="min-w-[14rem] flex-1 rounded-xl border border-border bg-[var(--input)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--brand-teal-bright)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => { setTouched(true); void runScan() }}
            disabled={scanning || !check.ok}
            className="pill pill-solid px-6 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {scanning ? "Scanning…" : "Scan my website"}
          </button>
        </div>

        {showValidation ? (
          <p id="business-url-error" role="alert" className="mt-2 text-xs text-[var(--destructive)]">
            {check.ok ? "" : check.message}
          </p>
        ) : (
          <p id="business-url-hint" className="mt-2 text-xs text-muted-foreground">
            {check.ok ? `We'll scan ${check.url}` : "With or without https:// — either works."}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4">
            <p className="text-sm">{error}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You can try a different address, or set your business up by hand — it takes a couple of minutes.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => void runScan()} className="pill pill-outline border-foreground/25 px-5 text-xs">
                Try again
              </button>
              <button type="button" onClick={onSkip} className="pill pill-outline border-foreground/25 px-5 text-xs">
                Set it up manually
              </button>
            </div>
          </div>
        )}

        {!error && (
          <button
            type="button"
            onClick={onSkip}
            disabled={scanning}
            className="mt-6 block text-sm text-[var(--brand-teal-bright)] transition-colors hover:text-[var(--brand-teal)] disabled:opacity-60"
          >
            I don&apos;t have a website — set up manually
          </button>
        )}
      </div>

      <AiControlCenter events={events} className="lg:sticky lg:top-6" />
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm ${value ? "" : "text-muted-foreground"}`}>
        {value || "Not found"}
      </dd>
    </div>
  )
}
