import { Suspense } from "react"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { CreateFlyerFlow } from "@/components/create-flyer-flow"

export const metadata = {
  title: "Onboarding — OneFlyer",
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
