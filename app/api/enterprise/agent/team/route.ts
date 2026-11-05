import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"

// GET /api/enterprise/agent/team -> the Leader's team (Phase 7). 403 with no
// data for anyone who isn't a Leader in an org with the team feature on.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "team")
  if ("response" in r) return r.response
  return NextResponse.json({ members: [] }, { headers: { "Cache-Control": "no-store" } })
}
