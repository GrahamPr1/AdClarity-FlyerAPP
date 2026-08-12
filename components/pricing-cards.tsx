"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Plan, MarketingPlanId } from "@/lib/types"
import { PLAN_GUARANTEE, PLAN_EXPLAINER } from "@/lib/types"
import { PLANS } from "@/lib/plans"
import { Reveal } from "@/components/reveal"

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--brand-teal-bright)"
      strokeWidth="2.5"
      className="mt-0.5 shrink-0"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function PlanCard({
  plan,
  onSubscribe,
  loadingId,
  delay,
}: {
  plan: Plan
  onSubscribe: (id: MarketingPlanId) => void
  loadingId: MarketingPlanId | null
  delay: number
}) {
  const highlighted = plan.mostPopular
  const isLoading = loadingId === plan.id

  return (
    <Reveal delay={delay} className="flex">
      <div
        className={`relative flex flex-col w-full rounded-2xl p-8 border transition-colors ${
          highlighted
            ? "border-[var(--brand-teal-bright)] bg-[var(--brand-teal-tint)] shadow-2xl shadow-[color:var(--brand-teal)]/25 ring-1 ring-white/15"
            : "border-white/10 bg-card hover:border-white/20"
        }`}
        style={
          highlighted
            ? { backgroundImage: "linear-gradient(165deg, rgba(201,112,74,0.16), rgba(224,138,94,0.05))" }
            : undefined
        }
      >
        {plan.badge && (
          <span
            className={`absolute -top-3 left-8 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide ${
              highlighted
                ? "bg-[var(--brand-teal-bright)] text-white shadow-lg shadow-[color:var(--brand-teal)]/40"
                : "bg-[var(--brand-amber)] text-[#3a2a00]"
            }`}
          >
            {plan.badge}
          </span>
        )}

        <h3 className="text-xl font-semibold tracking-tight text-white">{plan.name}</h3>
        <p className="mt-1.5 text-sm text-[var(--brand-teal-bright)] font-medium leading-snug">{plan.tagline}</p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{plan.description}</p>

        <div className="mt-6 flex items-baseline gap-2">
          <span className="text-4xl font-bold tracking-tight">
            {plan.monthlyFee === 0 ? "Free" : `$${plan.monthlyFee.toLocaleString()}`}
          </span>
          {plan.monthlyFee > 0 && <span className="text-sm text-muted-foreground">/ month</span>}
        </div>

        {plan.ctaHref ? (
          <a
            href={plan.ctaHref}
            className={`mt-6 w-full py-3.5 rounded-xl text-sm font-semibold text-center transition-colors ${
              highlighted
                ? "bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] shadow-lg shadow-[color:var(--brand-teal)]/30"
                : "bg-white/[0.06] text-foreground hover:bg-white/[0.12] border border-white/10"
            }`}
          >
            {plan.ctaLabel}
          </a>
        ) : (
          <button
            onClick={() => onSubscribe(plan.id)}
            disabled={isLoading}
            className={`mt-6 w-full py-3.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
              highlighted
                ? "bg-[var(--brand-teal-bright)] text-white hover:bg-[var(--brand-teal)] shadow-lg shadow-[color:var(--brand-teal)]/30"
                : "bg-white/[0.06] text-foreground hover:bg-white/[0.12] border border-white/10"
            }`}
          >
            {isLoading ? "Redirecting…" : plan.ctaLabel}
          </button>
        )}

        {/* Plan note */}
        <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-[var(--brand-teal-tint)] px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal-bright)" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span className="text-xs text-foreground/80 leading-snug">{plan.note}</span>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col gap-3">
          {plan.features.map((f) => (
            <div key={f} className="flex items-start gap-2.5 text-sm text-foreground/90">
              <CheckIcon />
              <span className="leading-snug">{f}</span>
            </div>
          ))}
        </div>

        {/* Outcome line */}
        <div className="mt-6 pt-5 border-t border-white/10 flex items-start gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal-bright)" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden="true">
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M21 7v5h-5" />
          </svg>
          <span className="text-sm text-foreground/75 leading-snug italic">{plan.outcome}</span>
        </div>
      </div>
    </Reveal>
  )
}

export function PricingCards() {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<MarketingPlanId | null>(null)

  // Every tier routes straight to onboarding — no real checkout exists yet
  // (it's being built separately), so nothing here should imply a payment
  // flow happened. Basic/Pro will eventually go through a Stripe Checkout
  // session first (plan.stripeMonthlyPriceId) before landing here.
  function handleSubscribe(planId: MarketingPlanId) {
    setLoadingId(planId)
    router.push(`/onboarding?plan=${planId}`)
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
        {PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onSubscribe={handleSubscribe}
            loadingId={loadingId}
            delay={i * 80}
          />
        ))}
      </div>

      {/* How the tiers relate */}
      <Reveal delay={160}>
        <div className="mt-10 max-w-3xl mx-auto rounded-2xl border border-white/10 bg-card p-6 md:p-7 flex items-start gap-4">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-[var(--brand-teal-tint)] flex items-center justify-center text-[var(--brand-teal-bright)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold">How the plans compare</h4>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{PLAN_EXPLAINER}</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={220}>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal-bright)" strokeWidth="2" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          {PLAN_GUARANTEE}
        </p>
      </Reveal>
    </>
  )
}
