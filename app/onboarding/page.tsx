import { Suspense } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { CreateFlyerFlow } from "@/components/create-flyer-flow"
import { getOrCreateClient, setClientPlan } from "@/lib/store"
import type { PlanId } from "@/lib/types"

export const metadata = {
  // Just the page name: the root layout supplies the " — OneFlyer" suffix
  // via metadata.title.template, so including it here rendered the tab as
  // "Onboarding — OneFlyer — OneFlyer".
  title: "Onboarding",
}

const VALID_PLAN_IDS: PlanId[] = ["trial", "basic", "pro"]

// middleware.ts already blocks an unauthenticated request from ever
// reaching this page — this re-checks anyway (defensive, cheap) and,
// unlike middleware, also knows the actual identity: onboarding is a
// client-only flow, so an admin session (no real "own" email) is sent to
// their own dashboard instead of a client's signup form.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })

  if (!session) redirect("/login?next=/onboarding")
  if (session.sub === ADMIN_SUB) redirect("/dashboard")

  // Pricing-card clicks land here as /onboarding?plan=basic|pro — there's no
  // Stripe checkout wired up yet (see lib/plans.ts's stripeMonthlyPriceId
  // stub), so until that exists, arriving here with a plan picked IS the
  // real enforcement action: apply it now rather than silently discarding
  // the param and leaving the account on whatever it already was.
  const { plan } = await searchParams
  if (plan && (VALID_PLAN_IDS as string[]).includes(plan)) {
    const client = await getOrCreateClient(session.sub)
    if (client.plan !== plan) await setClientPlan(session.sub, plan as PlanId)
  }

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-16 md:py-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 font-semibold mb-8">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </div>
        <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
          <CreateFlyerFlow email={session.sub} />
        </Suspense>
      </div>
    </main>
  )
}
