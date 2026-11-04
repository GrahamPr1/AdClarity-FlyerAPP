import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { isNopAgentAccount } from "@/lib/enterprise/agents-store"
import { OfferPageEditor } from "@/components/offer-page-editor"

export const metadata = {
  title: "Edit offer page",
}

// /dashboard/offer/<flyerId> — edit what one flyer's QR code opens. The
// editor loads and saves through /api/offer-page/<flyerId>, which does the
// ownership and plan checks.
export default async function OfferPageEditorRoute({ params }: { params: Promise<{ flyerId: string }> }) {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })
  if (!session) redirect("/login?next=/dashboard")
  if (session.sub === ADMIN_SUB) redirect("/dashboard")
  if (await isNopAgentAccount(session.sub)) redirect("/enterprise/nop/dashboard")
  const { flyerId } = await params

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-12 md:py-16">
      <div className="mx-auto max-w-5xl">
        <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 text-2xl tracking-tight">Edit offer page</h1>
        <p className="mt-1 mb-8 text-sm text-muted-foreground">What people see when they scan this flyer&apos;s QR code.</p>
        <OfferPageEditor flyerId={flyerId} />
      </div>
    </main>
  )
}
