import Link from "next/link"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getOrCreateClient } from "@/lib/store"
import { coloringPagesEnabled } from "@/lib/agent-pipeline/plan-features"
import { ColoringPageForm } from "@/components/coloring-page-form"

export const metadata = {
  title: "Create a coloring page",
  description: "A printable black-and-white coloring page, drawn to whatever you describe.",
}

export default async function ColoringPageRoute() {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })
  if (!session) redirect("/login?next=/coloring-page")
  if (session.sub === ADMIN_SUB) redirect("/dashboard")

  // Pro-only. Shown as a real explanation rather than a redirect — someone
  // who followed the locked option deserves to know what it is and what it
  // costs, not to be bounced somewhere with no reason given.
  const client = await getOrCreateClient(session.sub)
  const allowed = coloringPagesEnabled(client.plan)

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <div className="mx-auto max-w-2xl">
        <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">Create a coloring page</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Black-and-white line art, sized for letter paper and ready to print. Tell us what it
          should show — no design work, and nothing to lay out.
        </p>
        {allowed ? (
          <div className="mt-8">
            <ColoringPageForm />
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-[var(--brand-teal)]/40 bg-[var(--brand-teal-tint)] p-6">
            <p className="font-medium">Coloring pages are part of the Pro plan.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Describe a scene, a character or a theme and we draw it as printable black-and-white
              line art — sized for letter paper, ready to hand out. Each one uses a campaign from
              your monthly allowance, the same as a flyer.
            </p>
            <Link
              href="/#pricing"
              className="mt-5 inline-block rounded-xl bg-[var(--brand-teal-bright)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-teal)]"
            >
              See the Pro plan
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
