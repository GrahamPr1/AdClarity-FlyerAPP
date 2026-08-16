// Placeholder landing page — proves the /admin gate works end to end.
// Real content (users, cost, revenue drill-downs + the combined overview)
// gets built out in later phases; this page will be replaced by phase 5's
// combined overview once phases 2-4 exist for it to summarize.
export default function AdminPage() {
  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-6xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">OneFlyer Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You have admin access. Users, cost tracking, and revenue views are coming next.
      </p>
    </div>
  )
}
