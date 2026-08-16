import Link from "next/link"

// Placeholder landing page — real content (the combined overview) gets
// built out in phase 5, once phases 2-4 (users, cost, revenue) exist for
// it to summarize. Links to the drill-downs as they're built.
export default function AdminPage() {
  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-6xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">OneFlyer Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The combined overview lands here once cost and revenue views exist. For now:
      </p>
      <div className="mt-4 flex gap-4">
        <Link href="/admin/users" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          View Users →
        </Link>
        <Link href="/admin/costs" className="text-sm text-[var(--brand-teal-bright)] hover:text-[var(--brand-teal)] transition-colors">
          View AI Costs →
        </Link>
      </div>
    </div>
  )
}
