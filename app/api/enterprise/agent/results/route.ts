import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { agentResults } from "@/lib/enterprise/portal/results"

// GET /api/enterprise/agent/results -> this month's QR scans and leads. Only
// for an active Pro/Leader agent whose org has results on; a Basic agent gets
// a 403 and no numbers at all.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "results")
  if ("response" in r) return r.response
  return NextResponse.json(await agentResults(r.ctx.agent.agentId), { headers: { "Cache-Control": "no-store" } })
}
