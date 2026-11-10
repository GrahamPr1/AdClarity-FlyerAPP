import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { audit } from "@/lib/enterprise/program-admins"
import { TRIAL_DAYS, getProTrialSetting, listProTrialLog, setProTrialSetting } from "@/lib/enterprise/portal/pro-trial"

// /api/admin/enterprise/nop/pro-trial — the owner only (billing).
//   GET                         the free-trial setting and its log
//   POST { enabled, days }      turns the Pro free trial on or off, and its length (1–30 days). Logged.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  return NextResponse.json({ setting: await getProTrialSetting(), log: await listProTrialLog(), limits: TRIAL_DAYS }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; days?: unknown } | null
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 })
  const setting = await setProTrialSetting(body.enabled, Number(body.days), a.admin)
  if (!setting) return NextResponse.json({ error: "invalid_days", message: `Days must be ${TRIAL_DAYS.min}–${TRIAL_DAYS.max}.` }, { status: 422 })
  await audit({ admin: a.admin, name: null, role: "owner" }, "pro_trial", `${setting.enabled ? "on" : "off"}, ${setting.days} days`)
  return NextResponse.json({ setting })
}
