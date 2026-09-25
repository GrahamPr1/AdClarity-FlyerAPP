import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { CampaignDefaultsForm } from "@/components/campaign-defaults-form"
import { AccountStatus } from "@/components/account-status"
import { BusinessProfileForm } from "@/components/business-profile-form"
import { ThemeSetting } from "@/components/theme-setting"

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
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
            OneFlyer
          </div>
          <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl tracking-tight md:text-3xl">Your business</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          What OneFlyer knows about you. Every campaign starts from this, so you never re-type it.
        </p>

        {/* The canonical business profile. Anchored so the dashboard's
            "Update business details" can land directly on it. */}
        <div id="business" className="mt-8 scroll-mt-8">
          <BusinessProfileForm />
        </div>

        <div className="mt-8">
          <h2 className="text-lg">Campaign preferences</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Style and tone defaults applied to new campaigns.
          </p>
          <div className="mt-4">
            <CampaignDefaultsForm />
          </div>
        </div>
        <div className="mt-8">
          <ThemeSetting />
        </div>
        <AccountStatus />
      </div>
    </main>
  )
}
