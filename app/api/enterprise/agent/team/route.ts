import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { listTeam } from "@/lib/enterprise/portal/team"

// GET /api/enterprise/agent/team -> the Leader's team (team.ts): name, status
// and, for approved members, activity counts only. 403 with no data for anyone
// who isn't a Leader in an org with the team feature on.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "team")
  if ("response" in r) return r.response
  return NextResponse.json({ members: await listTeam(r.ctx.agent.agentId) }, { headers: { "Cache-Control": "no-store" } })
}
