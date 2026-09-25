"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { GuidedSetupFlow } from "./guided-setup-flow"
import { QuickPromptForm } from "./quick-prompt-form"
import { BusinessScanFlow } from "./business-scan-flow"
import { ProductCampaignFlow } from "./product-campaign-flow"
import type { PlanId } from "@/lib/types"

type Path = "scan" | "choose" | "product" | "guided" | "quick"

// The real "Create New Flyer" entry point (rendered by app/onboarding/page.tsx)
// — this app has no separate screen for it; /onboarding IS both first-time
// setup and every later "generate more flyers" visit (see the note on
// resubmission in app/api/intake/route.ts). This wrapper decides Guided vs
// Quick Prompt before either real flow loads.
export function CreateFlyerFlow({ email }: { email: string }) {
  // "scan" is the new front door for a client with no business profile yet.
  // Resolved in the effect below once we know whether one exists — starting
  // on "choose" and jumping would flash the old menu at a new client.
  const [path, setPath] = useState<Path | null>(null)
  const [hasProfile, setHasProfile] = useState(false)
  const [planId, setPlanId] = useState<PlanId | null>(null)
  const [hasSavedBrand, setHasSavedBrand] = useState(false)
  // Smart default routing: a "simple per-user flag" that's DERIVED rather
  // than a new stored boolean — flyersCreated>0 or a saved brand already
  // means real, observable history, so a separate flag that could drift
  // out of sync with that history would be redundant.
  const [isReturning, setIsReturning] = useState(false)

  useEffect(() => {
    // The scan screen is shown only to a client who has no business profile
    // yet. Everyone else — including every existing account, via the
    // read-through backfill — lands on the normal chooser, so this does not
    // put an extra step in front of people who already told us who they are.
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        setHasProfile(!!d.profile)
        setPath(d.profile ? "choose" : "scan")
      })
      .catch(() => setPath("choose"))
    fetch("/api/deliverables")
      .then((r) => r.json())
      .then((d) => {
        setPlanId(d.planId ?? null)
        if ((d.flyersCreated ?? 0) > 0) setIsReturning(true)
      })
      .catch(() => {})
    fetch("/api/brand-profile")
      .then((r) => r.json())
      .then((d) => {
        setHasSavedBrand(!!d.profile)
        if (d.profile) setIsReturning(true)
      })
      .catch(() => {})
  }, [])

  // Nothing is rendered until we know whether a profile exists, so a new
  // client never sees the chooser flash before the scan screen replaces it.
  if (path === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (path === "scan") {
    return (
      <BusinessScanFlow
        onComplete={() => { setHasProfile(true); setPath("choose") }}
        onSkip={() => setPath("guided")}
      />
    )
  }
  if (path === "product") return <ProductCampaignFlow onBack={() => setPath("choose")} />
  if (path === "guided") return <GuidedSetupFlow email={email} onBack={() => setPath("choose")} />
  if (path === "quick") return <QuickPromptForm email={email} hasSavedBrand={hasSavedBrand} onBack={() => setPath("choose")} />

  // Quick Prompt is a paid-plan feature (Basic/Pro), same as the spec's
  // "Available on every paid plan" — null planId means still loading, not
  // yet known to be ineligible, so the option isn't shown as blocked until
  // we actually know.
  const isPaidPlan = planId === "basic" || planId === "pro"
  // Only actually flip the default for a returning user who's ALSO
  // eligible for Quick Prompt — a returning Trial user still can't use it,
  // so Guided stays primary for them regardless of history.
  const quickIsPrimary = isReturning && isPaidPlan

  // Phase 3's primary path: the business is already known, so a campaign
  // starts from WHAT they're selling rather than from re-describing the
  // business. Only offered once a profile exists — without one there is
  // nothing for a product to inherit.
  const productCard = (
    <button
      type="button"
      onClick={() => setPath("product")}
      className="text-left rounded-2xl border-2 border-[var(--brand-teal-bright)] bg-card p-6 hover:bg-[var(--surface-sunken)] transition-colors sm:col-span-2"
    >
      <p className="text-lg font-semibold">Product, service or offer</p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Pick what you&apos;re promoting and get up to {5} creative options — each a different angle on the
        same details. Your business name, logo, colours and contact details are already filled in.
      </p>
    </button>
  )

  const guidedCard = (
    <button
      type="button"
      onClick={() => setPath("guided")}
      className={`text-left rounded-2xl border bg-card p-6 hover:bg-[var(--surface-sunken)] transition-colors ${
        quickIsPrimary || hasProfile ? "border-border" : "border-2 border-[var(--brand-teal-bright)]"
      }`}
    >
      <p className="text-lg font-semibold">Guided Setup</p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Answer a few questions about your business and brand — the highest-quality result, best if this is your first flyer.
      </p>
    </button>
  )

  const quickCard = (
    <button
      type="button"
      onClick={() => isPaidPlan && setPath("quick")}
      disabled={!isPaidPlan}
      className={`text-left rounded-2xl border bg-card p-6 hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card ${
        quickIsPrimary ? "border-2 border-[var(--brand-teal-bright)]" : "border-border"
      }`}
    >
      <p className="text-lg font-semibold">Quick Prompt</p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Describe what you need in one sentence and generate immediately — faster, best once you know what you want.
      </p>
      {planId !== null && !isPaidPlan && (
        <p className="mt-2 text-xs text-[var(--brand-teal-bright)]">
          <Link href="/#pricing" className="hover:text-[var(--brand-teal)] transition-colors">Upgrade to Basic or Pro</Link> to unlock Quick Prompt.
        </p>
      )}
    </button>
  )

  return (
    <div>
      {/* Picks up the thread from the landing page's "Create My First Campaign"
          CTA rather than dropping them onto a generic form — but only for
          someone who genuinely hasn't made one yet. /onboarding is also the
          "generate more flyers" route (see the note above), so a returning
          client gets the neutral heading instead of being told this is their
          first campaign. */}
      {isReturning ? (
        <>
          <h1 className="text-2xl md:text-3xl tracking-tight">Create a New Campaign</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose how you want to get started.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl md:text-3xl tracking-tight">Let&apos;s create your first campaign.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start with your business and what you want to promote — we&apos;ll turn it into your
            flyer and the matching versions to share.
          </p>
        </>
      )}

      {hasProfile && (
        <button
          type="button"
          onClick={() => setPath("scan")}
          className="mt-4 text-sm text-[var(--brand-teal-bright)] transition-colors hover:text-[var(--brand-teal)]"
        >
          Re-scan my website
        </button>
      )}

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        {hasProfile && productCard}
        {quickIsPrimary ? (
          <>
            {quickCard}
            {guidedCard}
          </>
        ) : (
          <>
            {guidedCard}
            {quickCard}
          </>
        )}
      </div>
    </div>
  )
}
