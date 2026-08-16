import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getClient } from "@/lib/store"

// Gates every /admin/* route. middleware.ts already requires a valid
// session to reach here at all (see its matcher); this is the finer-grained
// check on top — a valid session isn't necessarily an ADMIN one. The
// site-owner password login (ADMIN_SUB) always passes; a real client
// account only passes with isAdmin set (see setClientIsAdmin in
// lib/store.ts, granted via POST /api/admin/set-admin). A fresh Redis
// lookup, not something baked into the session token at login time — so
// revoking isAdmin takes effect immediately, not just on next login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })

  if (!session) {
    redirect("/login")
  }

  if (session.sub !== ADMIN_SUB) {
    const client = await getClient(session.sub)
    if (!client?.isAdmin) {
      redirect("/dashboard")
    }
  }

  return <>{children}</>
}
