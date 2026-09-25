import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { listCampaigns } from "@/lib/store"

/**
 * The client's campaigns — each one "generate N options" call.
 *
 * Separate from /api/deliverables rather than folded into it: that response
 * is consumed by the dashboard, the admin view and the onboarding chooser,
 * and widening a contract three surfaces depend on to carry grouping only
 * one of them needs is how those contracts get hard to change.
 */
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // The admin dashboard is a different view entirely and never groups by
  // campaign — it lists clients, not one client's work.
  if (session.sub === ADMIN_SUB) {
    return NextResponse.json({ campaigns: [] }, { headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json(
    { campaigns: await listCampaigns(session.sub) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
