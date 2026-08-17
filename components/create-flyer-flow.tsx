"use client"

import { useEffect, useState } from "react"
import { GuidedSetupFlow } from "./guided-setup-flow"
import { QuickPromptForm } from "./quick-prompt-form"
import type { PlanId } from "@/lib/types"

type Path = "choose" | "guided" | "quick"

// The real "Create New Flyer" entry point (rendered by app/onboarding/page.tsx)
// — this app has no separate screen for it; /onboarding IS both first-time
// setup and every later "generate more flyers" visit (see the note on
// resubmission in app/api/intake/route.ts). This wrapper decides Guided vs
// Quick Prompt before either real flow loads.
export function CreateFlyerFlow({ email }: { email: string }) {
  const [path, setPath] = useState<Path>("choose")
  const [planId, setPlanId] = useState<PlanId | null>(null)
  const [hasSavedBrand, setHasSavedBrand] = useState(false)
  // Smart default routing: a "simple per-user flag" that's DERIVED rather
  // than a new stored boolean — flyersCreated>0 or a saved brand already
  // means real, observable history, so a separate flag that could drift
  // out of sync with that history would be redundant.
  const [isReturning, setIsReturning] = useState(false)

  useEffect(() => {
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

  if (path === "guided") return <GuidedSetupFlow email={email} />
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

  const guidedCard = (
    <button
      type="button"
      onClick={() => setPath("guided")}
      className={`text-left rounded-2xl border bg-card p-6 hover:bg-white/[0.03] transition-colors ${
        quickIsPrimary ? "border-white/10" : "border-2 border-[var(--brand-teal-bright)]"
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
      className={`text-left rounded-2xl border bg-card p-6 hover:bg-white/[0.03] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card ${
        quickIsPrimary ? "border-2 border-[var(--brand-teal-bright)]" : "border-white/10"
      }`}
    >
      <p className="text-lg font-semibold">Quick Prompt</p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Describe what you need in one sentence and generate immediately — faster, best once you know what you want.
      </p>
      {planId !== null && !isPaidPlan && (
        <p className="mt-2 text-xs text-[var(--brand-teal-bright)]">
          <a href="/#pricing" className="hover:text-[var(--brand-teal)] transition-colors">Upgrade to Basic or Pro</a> to unlock Quick Prompt.
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
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Create a New Campaign</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose how you want to get started.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Let&apos;s create your first campaign.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start with your business and what you want to promote — we&apos;ll turn it into your
            flyer and the matching versions to share.
          </p>
        </>
      )}

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
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
