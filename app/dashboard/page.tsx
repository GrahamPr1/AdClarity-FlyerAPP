import { DashboardClient } from "@/components/dashboard-client"

export const metadata = {
  title: "Client Dashboard — OneFlyer",
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <DashboardClient />
    </main>
  )
}
