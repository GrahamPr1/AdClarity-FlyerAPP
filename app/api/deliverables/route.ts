import { NextResponse } from "next/server"
import { deliverables } from "@/lib/store"

// GET /api/deliverables
// Returns the client's current Deliverables (flyers + website) with a mix of
// statuses so the dashboard UI can be seen in all states.
//
// In production this data is owned by the database and continuously updated by
// the external Claude-based agent pipeline via the /api/agent-callback webhook.
export async function GET() {
  return NextResponse.json(deliverables)
}
