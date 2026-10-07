import { Suspense } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { isNopAgentAccount } from "@/lib/enterprise/agents-store"
import { DashboardClient } from "@/components/dashboard-client"
import { AdminDashboard } from "@/components/admin-dashboard"

export const metadata = {
  // See the note in app/onboarding/page.tsx — the root layout's title
  // template already appends " — OneFlyer".
  title: "Dashboard",
}

// Which dashboard renders is decided here, server-side, from the real
// session identity — never inferred client-side. The admin session
// (DASHBOARD_PASSWORD login) sees every client's flyers via AdminDashboard;
// every other session is a client's own email and only ever sees
// DashboardClient, scoped to their own data by the API routes it calls.
export default async function DashboardPage() {
  const cookieStore = await cookies()
  const session = await getSessionIdentity({ cookies: cookieStore })
  const isAdmin = session?.sub === ADMIN_SUB

  // NOP agents can't use the SMB dashboard (every generation route refuses
  // them), so until the NOP agent dashboard exists they land on their agent
  // profile. Only accounts holding an Agent ID; everyone else is unaffected.
  if (session && !isAdmin && (await isNopAgentAccount(session.sub))) redirect("/enterprise/nop/profile")

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* DashboardClient reads ?onboarded=1 via useSearchParams, which Next
          requires to sit inside a Suspense boundary. */}
      {isAdmin ? (
        <AdminDashboard />
      ) : (
        <Suspense fallback={null}>
          <DashboardClient />
        </Suspense>
      )}
    </main>
  )
}
