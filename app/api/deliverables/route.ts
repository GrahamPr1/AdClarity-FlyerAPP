import { NextRequest, NextResponse } from "next/server"
import { isAuthedRequest } from "@/lib/auth"
import { getDeliverables } from "@/lib/store"

// GET /api/deliverables
// Returns the client's current Deliverables (flyers only — no Website Agent
// exists yet) with a mix of statuses so the dashboard UI can be seen in all
// states.
//
// Protected by the same dashboard session cookie the /dashboard page
// requires — this route serves real client data and middleware.ts's matcher
// only covers page routes, not API routes.
//
// In production this data is owned by the database and continuously updated by
// the external Claude-based agent pipeline via the /api/agent-callback webhook.
export async function GET(request: NextRequest) {
  if (!(await isAuthedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const deliverables = await getDeliverables()
  return NextResponse.json(deliverables)
}
