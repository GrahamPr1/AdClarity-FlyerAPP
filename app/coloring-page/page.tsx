import Link from "next/link"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
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
        <div className="mt-8">
          <ColoringPageForm />
        </div>
      </div>
    </main>
  )
}
