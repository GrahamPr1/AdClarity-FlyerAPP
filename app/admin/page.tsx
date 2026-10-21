import Link from "next/link"
import { BillingOverview } from "@/components/admin/billing-overview"

// Admin landing page. Billing comes first (counts, estimated MRR, and what
// needs a human), then links to the other drill-downs.
export default function AdminPage() {
  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl tracking-tight">OneFlyer Admin</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to dashboard</Link>
      </div>
      <BillingOverview />
      <h2 className="mt-12 text-xl">Everything else</h2>
      <div className="mt-4 flex flex-wrap gap-4">
        <Link href="/admin/users" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          View Users →
        </Link>
        <Link href="/admin/costs" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          View AI Costs →
        </Link>
        <Link href="/admin/audit" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          Test Data Audit →
        </Link>
        <Link href="/admin/waitlist" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          Early Access Waitlist →
        </Link>
        <Link href="/admin/enterprise/nop" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          NOP Agents →
        </Link>
      </div>
    </div>
  )
}
