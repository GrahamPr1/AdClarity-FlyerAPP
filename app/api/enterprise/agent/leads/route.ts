import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { listAgentLeads } from "@/lib/enterprise/portal/agent-data"
import { followUpsForLeads } from "@/lib/enterprise/portal/follow-ups"

// GET /api/enterprise/agent/leads -> the agent's leads, newest first. Only an
// active Pro/Leader agent whose org has lead capture on (canUse); 403 with no
// data for anyone else. Read-only, so an admin viewing as the agent may read it.
// followUps: each lead's filled-in follow-up messages, by lead id; empty
// unless the agent can also use follow-ups.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "leads")
  if ("response" in r) return r.response
  const leads = await listAgentLeads(r.ctx.agent.agentId)
  return NextResponse.json({ leads, followUps: await followUpsForLeads(r.ctx, leads) }, { headers: { "Cache-Control": "no-store" } })
}
