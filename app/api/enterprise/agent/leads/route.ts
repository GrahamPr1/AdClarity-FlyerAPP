import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"

// GET /api/enterprise/agent/leads -> the agent's leads (Pro/Leader, org has
// lead capture on). 403 with no data for anyone else. Leads start arriving in
// Phase 2; until then the list is always empty.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "leads")
  if ("response" in r) return r.response
  return NextResponse.json({ leads: [] }, { headers: { "Cache-Control": "no-store" } })
}
