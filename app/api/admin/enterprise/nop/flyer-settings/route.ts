import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { AGENT_AREA_READY, getNopFlyerSettings, setNopFlyerSetting } from "@/lib/enterprise/nop-render/kit-v2-access"

// GET  /api/admin/enterprise/nop/flyer-settings
// POST /api/admin/enterprise/nop/flyer-settings { spanishV2?: boolean, agentKit?: "v1" | "v2" }
// OneFlyer admin only. Which kit agents get, and the Spanish kit-v2 switch.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ ...(await getNopFlyerSettings()), agentAreaReady: AGENT_AREA_READY }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  let body: { spanishV2?: unknown; agentKit?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (body.spanishV2 !== undefined && typeof body.spanishV2 !== "boolean") return NextResponse.json({ error: "spanishV2 must be true or false" }, { status: 422 })
  if (body.agentKit !== undefined && body.agentKit !== "v1" && body.agentKit !== "v2") return NextResponse.json({ error: "agentKit must be v1 or v2" }, { status: 422 })
  if (body.agentKit === "v2" && !AGENT_AREA_READY) {
    return NextResponse.json({ error: "agent_area_missing", message: "Kit v2 has no agent information area yet, so it can't be given to agents." }, { status: 409 })
  }
  const settings = await setNopFlyerSetting({ spanishV2: body.spanishV2 as boolean | undefined, agentKit: body.agentKit as "v1" | "v2" | undefined })
  console.log(`[nop] ${auth.admin} set flyer settings ${JSON.stringify(body)}`)
  return NextResponse.json({ ...settings, agentAreaReady: AGENT_AREA_READY })
}
