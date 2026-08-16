import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"

// Gates every /admin/* route. middleware.ts already requires a valid
// session to reach here at all (see its matcher); this is the finer-grained
// check on top — a valid session isn't necessarily an ADMIN one. A fresh
// Redis lookup (see isAdminSession), not something baked into the session
// token at login time — so revoking isAdmin takes effect immediately, not
// just on next login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })

  if (!session) {
    redirect("/login")
  }

  if (!(await isAdminSession(session.sub))) {
    redirect("/dashboard")
  }

  return <>{children}</>
}
