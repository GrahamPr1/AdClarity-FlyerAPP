import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliverables, getDeliverablesForEmail } from "@/lib/store"
import { buildFlyerBreakdown } from "@/lib/tracking-breakdown"

// GET /api/tracking/flyer/{flyerId} — scans and clicks for one flyer, broken
// down by distribution channel.
//
// Session-gated and owner-checked, unlike GET /api/tracking/{code}: that one
// reports a single code a client already holds, whereas this enumerates every
// channel of a flyer and would otherwise let anyone walk another business's
// campaign performance by guessing flyer ids.
//
// Admin is allowed through, matching GET /api/tracking/{code} which has always
// let admin read any code. Rejecting it was a regression: the admin dashboard
// renders the mirrored latest-client view, so every stat line on it 401'd and
// silently disappeared.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ flyerId: string }> }) {
  const session = await getSessionIdentity(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { flyerId } = await params
  // Admin has no deliverables of its own — the admin dashboard mirrors the
  // most recent client (see getDeliverables). Looking admin up by session.sub
  // returns an empty list and 404s every flyer on the page.
  const isAdmin = session.sub === ADMIN_SUB
  const deliverables = isAdmin ? await getDeliverables() : await getDeliverablesForEmail(session.sub)
  const ownerEmail = isAdmin ? deliverables.email : session.sub
  const flyer = deliverables.flyers.find((f) => f.id === flyerId)
  // 404 rather than 403: probing ids reveals nothing about what exists.
  if (!flyer || !ownerEmail) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(await buildFlyerBreakdown(flyerId, flyer.trackingCode, ownerEmail))
}
