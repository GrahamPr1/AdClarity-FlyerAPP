import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"

// GET /api/enterprise/agent/portal -> the agent's tier, which features they
// can use, and their tabs. Everything else the portal decides comes from here
// or from the same canUse() on the server.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, null)
  if ("response" in r) return r.response
  const { ctx, viewer } = r
  return NextResponse.json(
    { tier: ctx.tier, orgId: ctx.orgId, can: ctx.can, tabs: ctx.tabs, readOnly: viewer.viewAs !== null },
    { headers: { "Cache-Control": "no-store" } },
  )
}
