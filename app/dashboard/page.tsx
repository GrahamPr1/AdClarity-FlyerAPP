import { cookies } from "next/headers"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      {isAdmin ? <AdminDashboard /> : <DashboardClient />}
    </main>
  )
}
