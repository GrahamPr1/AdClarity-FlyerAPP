import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { agentPlatformEnabled } from "@/lib/ap/flag"
import { apAdminFromCookies } from "@/lib/ap/tenant"

// /admin/organizations/*: app/admin/layout.tsx has already required an admin
// session. On top: the platform must be on (else 404), and the admin must be
// the owner login or on AP_ADMIN_EMAILS (else 404 too, so nothing hints at it).
export default async function OrganizationsLayout({ children }: { children: React.ReactNode }) {
  if (!agentPlatformEnabled()) notFound()
  if (!(await apAdminFromCookies(await cookies()))) notFound()
  return <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
}
