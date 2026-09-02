import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { listWaitlistEntries } from "@/lib/store"

// GET /api/admin/waitlist?plan=basic|pro&format=csv
//
// Uses the SAME isAdminSession check that guards /admin/audit and every other
// /api/admin/* route — deliberately not a new env var or a separate admin
// flag. A second door into admin functionality is a second door to get wrong.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const planFilter = url.searchParams.get("plan")
  const all = await listWaitlistEntries()
  const entries = planFilter === "basic" || planFilter === "pro" ? all.filter((e) => e.desiredPlan === planFilter) : all

  if (url.searchParams.get("format") === "csv") {
    // Quote every field and double internal quotes — a business email is
    // unlikely to contain a comma, but "unlikely" silently corrupts a CSV.
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`
    const rows = [
      ["email", "plan", "billing", "signed_up", "notified_at", "converted_at"].join(","),
      ...entries.map((e) =>
        [esc(e.email), esc(e.desiredPlan), esc(e.billingInterval), esc(e.createdAt), esc(e.notifiedAt), esc(e.convertedAt)].join(","),
      ),
    ].join("\n")
    return new NextResponse(rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="oneflyer-waitlist.csv"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const summary = {
    total: all.length,
    basic: all.filter((e) => e.desiredPlan === "basic").length,
    pro: all.filter((e) => e.desiredPlan === "pro").length,
    monthly: all.filter((e) => e.billingInterval === "monthly").length,
    annual: all.filter((e) => e.billingInterval === "annual").length,
    notNotified: all.filter((e) => !e.notifiedAt).length,
  }
  return NextResponse.json({ entries, summary }, { headers: { "Cache-Control": "no-store" } })
}
