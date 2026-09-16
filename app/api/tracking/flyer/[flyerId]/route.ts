import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliverablesForEmail } from "@/lib/store"
import { buildFlyerBreakdown } from "@/lib/tracking-breakdown"

// GET /api/tracking/flyer/{flyerId} — scans and clicks for one flyer, broken
// down by distribution channel.
//
// Session-gated and owner-checked, unlike GET /api/tracking/{code}: that one
// reports a single code a client already holds, whereas this enumerates every
// channel of a flyer and would otherwise let anyone walk another business's
// campaign performance by guessing flyer ids.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ flyerId: string }> }) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { flyerId } = await params
  const deliverables = await getDeliverablesForEmail(session.sub)
  const flyer = deliverables.flyers.find((f) => f.id === flyerId)
  // 404 rather than 403: probing ids reveals nothing about what exists.
  if (!flyer) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(await buildFlyerBreakdown(flyerId, flyer.trackingCode, session.sub))
}
