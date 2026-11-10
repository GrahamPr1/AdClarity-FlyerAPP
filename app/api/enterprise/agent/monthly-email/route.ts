import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { getAgentProfile, saveAgentProfile } from "@/lib/store"

// POST /api/enterprise/agent/monthly-email { on: boolean } — the agent turns their
// monthly results email on or off (monthly-email.ts). Never while an admin views the portal.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "monthlyEmail")
  if ("response" in r) return r.response
  const on = ((await request.json().catch(() => null)) as { on?: unknown } | null)?.on
  if (typeof on !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 })
  const profile = await getAgentProfile(r.ctx.email)
  if (!profile) return NextResponse.json({ error: "not_registered" }, { status: 404 })
  const { savedAt: _savedAt, ...rest } = profile
  void _savedAt
  await saveAgentProfile(r.ctx.email, { ...rest, monthlyEmail: on })
  return NextResponse.json({ ok: true, on })
}
