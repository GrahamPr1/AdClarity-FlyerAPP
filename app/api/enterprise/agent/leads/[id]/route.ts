import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { updateAgentLeadTracking } from "@/lib/enterprise/portal/agent-data"
import { checkTrackerPatch } from "@/lib/enterprise/portal/lead-tracker"

// PATCH /api/enterprise/agent/leads/{id} { status?, notes?, followUpOn? } — the
// lead tracker (lead-tracker.ts) on one of the agent's own leads. The old
// { contacted: boolean } still works (Contacted / New). A write: refused
// outright while an admin is viewing as the agent, and only for a lead under
// THIS agent's ID.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "leads")
  if ("response" in r) return r.response
  const { id } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const check = checkTrackerPatch(body ?? {})
  if (!check.ok) return NextResponse.json({ error: "invalid", field: check.field }, { status: 400 })
  if (Object.keys(check.patch).length === 0) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const lead = await updateAgentLeadTracking(r.ctx.agent.agentId, id, check.patch)
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json({ lead })
}
