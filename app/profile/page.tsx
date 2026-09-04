import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { CampaignDefaultsForm } from "@/components/campaign-defaults-form"
import { AccountStatus } from "@/components/account-status"

export const metadata = {
  // The root layout's title template appends " — OneFlyer".
  title: "Your brand details",
}

// The optional profile step. Everything here used to live inside onboarding,
// standing between a new signup and their first flyer despite none of it
// being required to produce one.
//
// Client-only, same as /onboarding: an admin session has no "own" business to
// describe, so it's sent to the dashboard instead. middleware.ts already
// requires a session before this renders; this re-checks because it also
// needs the actual identity.
export default async function ProfilePage() {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })

  if (!session) redirect("/login?next=/profile")
  if (session.sub === ADMIN_SUB) redirect("/dashboard")

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-2 font-semibold">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </div>
        <h1 className="text-2xl tracking-tight md:text-3xl">Your brand details</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          All optional — your campaigns work without any of it. Fill in what you know and
          every future campaign will use it automatically, so you never re-type it.
        </p>
        <div className="mt-8">
          <CampaignDefaultsForm />
        </div>
        <AccountStatus />
      </div>
    </main>
  )
}
