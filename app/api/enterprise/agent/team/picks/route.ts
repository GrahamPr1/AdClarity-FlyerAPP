import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { agentFlyerKit, getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { addPick, checkPick, listPicks, removePick } from "@/lib/enterprise/portal/team"

// /api/enterprise/agent/team/picks — "Send to team" (team.ts). Leaders only (canUse "team").
//   GET                          the Leader's current picks
//   POST   { pkg, pricing? }     send one of the program's flyers (in the kit in use) to the team
//   DELETE { id }                take a pick back
// Never while an admin views the portal.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "team")
  if ("response" in r) return r.response
  return NextResponse.json({ picks: await listPicks(r.ctx.agent.agentId) }, { headers: { "Cache-Control": "no-store" } })
}

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  return (await request.json().catch(() => null)) as Record<string, unknown> | null
}

export async function POST(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "team")
  if ("response" in r) return r.response
  const pick = checkPick((await body(request)) ?? {}, agentFlyerKit(await getNopFlyerSettings()))
  if (!pick) return NextResponse.json({ error: "invalid_pick" }, { status: 422 })
  return NextResponse.json({ picks: await addPick(r.ctx.agent.agentId, pick) })
}

export async function DELETE(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "team")
  if ("response" in r) return r.response
  const id = (await body(request))?.id
  if (typeof id !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 })
  return NextResponse.json({ picks: await removePick(r.ctx.agent.agentId, id) })
}
