import { SidebarLayout } from "@/components/refresh/sidebar-layout"
import { StatTile } from "@/components/refresh/ui"

// /preview/components/sidebar: the shared navy sidebar layout, with the
// Dashboard's groups as the parity map places them (primary actions first,
// settings-type items under Account). Links here are the real app URLs.
export default function SidebarPreview() {
  return (
    <SidebarLayout
      label="Dashboard"
      primaryAction={{ href: "/onboarding", label: "New campaign" }}
      groups={[
        { items: [
          { href: "/preview/components/sidebar", label: "My flyers" },
          { href: "/dashboard#leads", label: "Leads", match: "/dashboard/leads" },
          { href: "/dashboard#scans", label: "QR scans", match: "/dashboard/scans" },
          { href: "/dashboard#print-requests", label: "Print requests", match: "/dashboard/print" },
          { href: "/dashboard#forms", label: "Forms", match: "/dashboard/forms" },
        ] },
        { heading: "Account", items: [
          { href: "/profile#business", label: "Business profile", match: "/profile/business" },
          { href: "/profile#billing", label: "Plan & billing", match: "/profile/billing" },
          { href: "/profile#settings", label: "Settings", match: "/profile/settings" },
        ] },
      ]}
      box={<><span style={{ fontWeight: 700, color: "#FFFFFF" }}>Basic plan (sample)</span><span>7 of 25 flyers this month</span></>}
      footer={<a href="/login" className="rf-side-link" style={{ fontSize: 14 }}>Sign out</a>}
    >
      <p style={{ margin: 0, fontSize: 14, color: "var(--rf-muted)" }}>Design preview · sidebar layout · sample values</p>
      <h1 className="rf-serif" style={{ margin: 0, fontSize: 40 }}>Your flyers</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <StatTile label="Flyers this month (sample)" value="7" />
        <StatTile label="QR scans, 30 days (sample)" value="42" accent="blue" />
        <StatTile label="New leads (sample)" value="5" accent="teal" />
      </div>
    </SidebarLayout>
  )
}
