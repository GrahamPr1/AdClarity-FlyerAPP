import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { OrgAdminSignIn } from "@/components/nop-org-admin"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { nopConsoleActor } from "@/lib/enterprise/org-admins"

export const metadata: Metadata = { title: `${NOP_ORG_NAME} admin sign-in` }

// Public: NOP org admins sign in here with an emailed code. Already signed
// in (as an org admin or the site owner) -> straight to the console.
export default async function NopAdminSignInPage() {
  if (await nopConsoleActor({ cookies: await cookies() })) redirect("/admin/enterprise/nop")
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <div className="mx-auto max-w-md">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{NOP_ORG_NAME}</p>
        <h1 className="mt-2 text-2xl">Admin sign-in</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">Enter the email you were invited with. We&apos;ll email you a sign-in code; there is no password.</p>
        <OrgAdminSignIn />
        <p className="mt-8 text-xs text-muted-foreground">
          Site owner? <a className="underline" href="/login?next=/admin/enterprise/nop">Sign in here</a>.
        </p>
      </div>
    </main>
  )
}
