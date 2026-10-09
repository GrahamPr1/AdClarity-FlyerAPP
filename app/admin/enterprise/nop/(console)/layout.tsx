import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { nopConsoleActor } from "@/lib/enterprise/org-admins"

// Gates the NOP admin console: the site owner (admin dashboard session) or a
// current NOP org admin (their own session cookie, see lib/enterprise/org-admins.ts).
// Every request re-checks the org-admin record, so a removed org admin is
// out at once. Everything else under /admin stays owner-only
// (app/admin/(owner)/layout.tsx).
export default async function NopConsoleLayout({ children }: { children: React.ReactNode }) {
  const who = await nopConsoleActor({ cookies: await cookies() })
  if (!who) redirect("/admin/enterprise/nop/sign-in")
  return <>{children}</>
}
