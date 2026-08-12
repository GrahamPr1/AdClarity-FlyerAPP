import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliverables, getDeliverablesForEmail } from "@/lib/store"

// GET /api/deliverables
// Returns the signed-in session's Deliverables (flyers only — no Website
// Agent exists yet). A client session (sub = their email) sees ONLY their
// own deliverables; the admin session (sub = ADMIN_SUB, the site owner's
// single login) sees whichever client submitted most recently, matching the
// dashboard's original behavior before per-client scoping existed.
//
// Protected by the same dashboard session cookie the /dashboard page
// requires — this route serves real client data and middleware.ts's matcher
// only covers page routes, not API routes.
//
// In production this data is owned by the database and continuously updated by
// the external Claude-based agent pipeline via the /api/agent-callback webhook.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const deliverables = session.sub === ADMIN_SUB ? await getDeliverables() : await getDeliverablesForEmail(session.sub)
  return NextResponse.json(deliverables)
}
