import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { programAdminFrom } from "@/lib/enterprise/program-admins"
import { ProgramAdminSignIn } from "@/components/program-admin"

export const dynamic = "force-dynamic"

// /program: sign-in for program admins (an emailed code). Signed in: straight to the agents screen.
export default async function Page() {
  if (await programAdminFrom({ cookies: await cookies() })) redirect("/program/agents")
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Neighborhood Outreach Program</p>
      <h1 className="mt-2 text-2xl tracking-tight">Program admin sign-in</h1>
      <p className="mt-2 text-sm text-muted-foreground">Enter your email. If it&apos;s a program admin&apos;s, we&apos;ll send a 6-digit code.</p>
      <ProgramAdminSignIn />
    </main>
  )
}
