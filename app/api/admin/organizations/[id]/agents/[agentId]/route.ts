import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { isTier } from "@/lib/ap/validate"
import { getOrg, updateAgent } from "@/lib/ap/store"
import { AGENT_STATUSES, type ApAgentStatus } from "@/lib/ap/types"
import { jsonError, noStore, readJson } from "@/lib/ap/http"

// PATCH /api/admin/organizations/{id}/agents/{agentId}  {status?, tier?}
// Approve (pending -> active), suspend, reactivate, or set the tier. The agent
// must belong to this org (updateAgent refuses any other).
export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; agentId: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const { id, agentId } = await params
  const org = await getOrg(id)
  if (!org) return jsonError(404, "not_found")
  const body = await readJson(request)
  const status = body?.status
  const tier = body?.tier
  if (status !== undefined && !(AGENT_STATUSES as readonly unknown[]).includes(status)) return jsonError(422, "invalid", { field: "status" })
  if (tier !== undefined && !isTier(tier)) return jsonError(422, "invalid", { field: "tier" })
  if (status === undefined && tier === undefined) return jsonError(422, "invalid", { message: "Nothing to change." })
  const agent = await updateAgent(org.id, agentId, { status: status as ApAgentStatus | undefined, tier: tier as "basic" | "pro" | undefined }, a.admin)
  if (!agent) return jsonError(404, "not_found")
  return NextResponse.json({ agent }, { headers: noStore })
}
