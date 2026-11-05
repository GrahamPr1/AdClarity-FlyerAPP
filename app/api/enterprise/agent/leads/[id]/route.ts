import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { setAgentLeadContacted } from "@/lib/enterprise/portal/agent-data"

// PATCH /api/enterprise/agent/leads/{id} { contacted: boolean } — mark one of
// the agent's own leads contacted, or undo it. A write: refused outright while
// an admin is viewing as the agent, and only for a lead under THIS agent's ID.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "leads")
  if ("response" in r) return r.response
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { contacted?: unknown } | null
  if (typeof body?.contacted !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 })
  const lead = await setAgentLeadContacted(r.ctx.agent.agentId, id, body.contacted)
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json({ lead })
}
