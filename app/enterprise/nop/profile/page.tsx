import { redirect } from "next/navigation"
import Link from "next/link"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { NopProfileForm } from "@/components/nop-agent"

export const metadata = { title: "Agent profile" }

// Checks the session here rather than widening middleware's matcher: an
// agent registers onto an existing OneFlyer account, so signing in comes first.
export default async function Page() {
  const session = await getSessionIdentity({ cookies: await cookies() })
  if (!session) redirect("/login?next=/enterprise/nop/profile")
  if (session.sub === ADMIN_SUB) redirect("/admin/enterprise/nop")

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
            OneFlyer
          </div>
          <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Dashboard
          </Link>
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{NOP_ORG_NAME}</p>
        <h1 className="mt-2 text-2xl">Your agent profile</h1>
        <p className="mt-2 mb-8 text-sm text-muted-foreground">Your Agent ID and program details come from your program administrator. The name, phone and email on your flyers are yours to edit.</p>
        <NopProfileForm />
      </div>
    </main>
  )
}
