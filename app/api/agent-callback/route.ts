import { NextResponse } from "next/server"
import { updateDeliverable } from "@/lib/store"

// POST /api/agent-callback
// -----------------------------------------------------------------------------
// WEBHOOK STUB for the external Claude-based agent pipeline.
//
// When the pipeline finishes a flyer or a website, it will POST here to update
// the corresponding deliverable's status/fields. The dashboard then reflects
// the new state on its next fetch.
//
// Expected body shape (placeholder):
//   { "type": "flyer",   "id": "flyer-3", "status": "Ready", "downloadUrl": "…", "thumbnailUrl": "…" }
//   { "type": "website", "id": "site-1",  "status": "Live",  "url": "https://…" }
//
// NOTE: No auth logic yet — in production this endpoint must verify a signed
// secret / signature from the pipeline before accepting updates.
// -----------------------------------------------------------------------------
export async function POST(request: Request) {
  let body: {
    type: "flyer" | "website"
    id: string
    status?: string
    thumbnailUrl?: string
    downloadUrl?: string
    url?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.type || !body.id) {
    return NextResponse.json({ error: "Missing required fields: type, id" }, { status: 422 })
  }

  const updated = updateDeliverable(body)
  if (!updated) {
    return NextResponse.json({ error: "Deliverable not found" }, { status: 404 })
  }

  console.log("[v0] Agent callback — deliverable updated:", body)
  return NextResponse.json({ ok: true, updated })
}
