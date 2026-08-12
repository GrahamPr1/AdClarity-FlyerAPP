import { NextRequest, NextResponse } from "next/server"
import { isAuthedRequest } from "@/lib/auth"
import { updateDeliverable } from "@/lib/store"

// POST /api/agent-callback
// -----------------------------------------------------------------------------
// WEBHOOK STUB for the external Claude-based agent pipeline.
//
// When the pipeline finishes a flyer, it will POST here to update the
// corresponding deliverable's status/fields. The dashboard then reflects the
// new state on its next fetch. Flyers only — no Website Agent exists yet.
//
// Expected body shape (placeholder):
//   { "type": "flyer", "id": "flyer-3", "email": "client@example.com", "status": "Ready", "downloadUrl": "…", "thumbnailUrl": "…" }
//
// email identifies which client's deliverable list to update — deliverable
// storage is keyed per-client (see lib/store.ts), not a single global blob.
//
// Protected by the same dashboard session cookie as the other data-bearing
// routes. NOTE: if the pipeline is ever moved to run truly externally (not
// in-process, as it is today), this will need its own signed secret/
// signature check instead of a browser session cookie — an external caller
// has no dashboard session to send.
// -----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!(await isAuthedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    type: "flyer"
    id: string
    email: string
    status?: string
    thumbnailUrl?: string
    downloadUrl?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.type || !body.id || !body.email) {
    return NextResponse.json({ error: "Missing required fields: type, id, email" }, { status: 422 })
  }

  const updated = await updateDeliverable(body.email, body)
  if (!updated) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 })
  }

  console.log("[v0] Agent callback — deliverable updated:", body)
  return NextResponse.json({ ok: true, updated })
}
