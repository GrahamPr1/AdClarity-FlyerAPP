import Link from "next/link"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { CreateFlyerFlow } from "@/components/create-flyer-flow"

export const metadata = {
  // Just the page name: the root layout supplies the " — OneFlyer" suffix
  // via metadata.title.template, so including it here rendered the tab as
  // "Onboarding — OneFlyer — OneFlyer".
  title: "Onboarding",
}

// middleware.ts already blocks an unauthenticated request from ever
// reaching this page — this re-checks anyway (defensive, cheap) and,
// unlike middleware, also knows the actual identity: onboarding is a
// client-only flow, so an admin session (no real "own" email) is sent to
// their own dashboard instead of a client's signup form.
export default async function OnboardingPage() {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })

  if (!session) redirect("/login?next=/onboarding")
  if (session.sub === ADMIN_SUB) redirect("/dashboard")

  // ?plan= is ignored here now that billing is live. It used to grant the
  // plan it named (upgrades only), because there was no checkout to send
  // anyone to. A paid plan now comes only from a confirmed Stripe
  // subscription (app/api/stripe/webhook) — a URL can't grant one. The paid
  // pricing CTAs go to /checkout instead; old links with ?plan= still land
  // here harmlessly, as a plain onboarding.

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-16 md:py-24">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--brand-teal-bright)]" />
            OneFlyer
          </div>
          {/* 4B: never trapped in a flow. The in-flow Back buttons step
              between stages; this leaves the flow entirely. */}
          <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Back to dashboard
          </Link>
        </div>
        <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
          <CreateFlyerFlow email={session.sub} />
        </Suspense>
      </div>
    </main>
  )
}
