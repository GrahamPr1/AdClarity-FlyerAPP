"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Plan, PlanId } from "@/lib/types"
import { PLAN_GUARANTEE, RETAINER_EXPLANATION, AD_SPEND_MIN, AD_SPEND_DEFAULT } from "@/lib/types"
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
  adSpend,
  onAdSpendChange,
}: {
  plan: Plan
  onSubscribe: (id: PlanId) => void
  loadingId: PlanId | null
  delay: number
  adSpend: number
  onAdSpendChange: (value: number) => void
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
            ? { backgroundImage: "linear-gradient(165deg, rgba(19,168,164,0.16), rgba(14,124,123,0.05))" }
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

        {/* Hybrid fee: one-time build + recurring, clearly separated */}
        {plan.hasAdSpend ? (
          <div className="mt-6 flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">${plan.setupFee.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">one-time build</span>
            </div>
            <span className="text-sm text-muted-foreground">+ your monthly ad spend (you choose)</span>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">${plan.monthlyFee.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            <span className="text-sm text-muted-foreground">+ ${plan.setupFee.toLocaleString()} one-time build</span>
          </div>
        )}

        {/* Ad-spend selector — only for the plan that includes paid ads */}
        {plan.hasAdSpend && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <label htmlFor="adSpend" className="block text-xs font-medium text-foreground/80">
              Monthly ad budget
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-[var(--brand-navy-deep)] px-3 py-2 focus-within:border-[var(--brand-teal-bright)]">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                id="adSpend"
                type="number"
                min={AD_SPEND_MIN}
                step={50}
                value={adSpend}
                onChange={(e) => onAdSpendChange(Number(e.target.value))}
                className="w-full bg-transparent text-sm text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-muted-foreground">/ mo</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground leading-snug">
              Minimum ${AD_SPEND_MIN}/mo. This is your ad budget — set it now and change it anytime.
            </p>
          </div>
        )}

        {/* Value anchor — makes the price feel like a steal */}
        <div className="mt-4 inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-lg bg-[var(--brand-amber)]/12 border border-[var(--brand-amber)]/25">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-amber)" strokeWidth="2.2" aria-hidden="true">
            <path d="m13 2-3 7h6l-5 13 3-9H8l5-11Z" />
          </svg>
          <span className="text-xs font-semibold text-[var(--brand-amber)]">{plan.valueAnchor}</span>
        </div>

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

        {/* Retainer explanation — what the monthly keeps buying you */}
        <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-[var(--brand-teal-tint)] px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal-bright)" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span className="text-xs text-foreground/80 leading-snug">{plan.retainerNote}</span>
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
  const [loadingId, setLoadingId] = useState<PlanId | null>(null)
  const [adSpend, setAdSpend] = useState<number>(AD_SPEND_DEFAULT)

  // Placeholder subscribe handler.
  // TODO: Wire this to a Stripe Checkout session created on the server.
  // The session should include:
  //   1) the one-time build fee (plan.stripeSetupPriceId)
  //   2) the recurring monthly charge:
  //        - Basic: a fixed $50/mo price (plan.stripeMonthlyPriceId)
  //        - Plus: the client-chosen ad spend billed monthly. Create the
  //          recurring line item with a dynamic unit_amount of `adSpend * 100`
  //          (or a metered price), and store `adSpend` on the subscription
  //          metadata so it can be changed later from the dashboard.
  // Set success_url to `${origin}/onboarding?plan=${planId}` (append
  // `&adSpend=${adSpend}` for the Plus plan).
  function handleSubscribe(planId: PlanId) {
    setLoadingId(planId)
    const plan = PLANS.find((p) => p.id === planId)
    // For now we simulate a successful checkout and go straight to onboarding.
    const query =
      plan?.hasAdSpend ? `?plan=${planId}&adSpend=${Math.max(AD_SPEND_MIN, adSpend || 0)}` : `?plan=${planId}`
    router.push(`/onboarding${query}`)
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto items-stretch">
        {PLANS.map((plan, i) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onSubscribe={handleSubscribe}
            loadingId={loadingId}
            delay={i * 80}
            adSpend={adSpend}
            onAdSpendChange={setAdSpend}
          />
        ))}
      </div>

      {/* How the monthly retainer works */}
      <Reveal delay={160}>
        <div className="mt-10 max-w-3xl mx-auto rounded-2xl border border-white/10 bg-card p-6 md:p-7 flex items-start gap-4">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-[var(--brand-teal-tint)] flex items-center justify-center text-[var(--brand-teal-bright)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold">How the monthly retainer works</h4>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{RETAINER_EXPLANATION}</p>
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
