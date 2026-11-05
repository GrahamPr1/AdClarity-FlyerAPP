import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { AGENT_FEATURES, FEATURE_LABELS, FEATURE_TIER, isAgentFeature } from "@/lib/enterprise/portal/features"
import { getOrgFeatures, setOrgFeature } from "@/lib/enterprise/portal/store"
import { NOP_ORG_ID, NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"

// GET  /api/admin/enterprise/features -> each org's Pro/Leader feature switches
// POST /api/admin/enterprise/features { orgId, feature, enabled } -> switch one
// Admin only. An org switch that's off hides the feature from all its agents.
export const dynamic = "force-dynamic"

const ORGS = [{ id: NOP_ORG_ID, name: NOP_ORG_NAME }]

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const orgs = await Promise.all(ORGS.map(async (o) => ({ ...o, features: await getOrgFeatures(o.id) })))
  const features = AGENT_FEATURES.map((f) => ({ id: f, label: FEATURE_LABELS[f], tier: FEATURE_TIER[f] }))
  return NextResponse.json({ orgs, features }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  let body: { orgId?: unknown; feature?: unknown; enabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!ORGS.some((o) => o.id === body.orgId)) return NextResponse.json({ error: "Unknown org" }, { status: 404 })
  if (!isAgentFeature(body.feature) || typeof body.enabled !== "boolean") return NextResponse.json({ error: "feature and enabled (boolean) are required" }, { status: 422 })
  const features = await setOrgFeature(body.orgId as string, body.feature, body.enabled)
  console.log(`[agent-portal] ${auth.admin} turned ${body.feature} ${body.enabled ? "on" : "off"} for org ${body.orgId}`)
  return NextResponse.json({ ok: true, features })
}
