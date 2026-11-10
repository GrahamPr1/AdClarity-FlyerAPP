import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { AGENT_AREA_READY, getNopFlyerSettings, listNopFlyerSettingsLog, logNopFlyerSettingChange, setNopFlyerSetting } from "@/lib/enterprise/nop-render/kit-v2-access"
import { checkEnrollDomain, getEnrollDomain } from "@/lib/enterprise/nop-enroll-domain"

// GET  /api/admin/enterprise/nop/flyer-settings
// POST /api/admin/enterprise/nop/flyer-settings { spanishV2?: boolean, agentKit?: "v1" | "v2" }
// OneFlyer admin only. Which kit agents get, and the Spanish kit-v2 switch.
// Every change is kept in the settings log (who, when, before and after),
// which GET returns for the admin page.
// Agents can't be switched to kit v2 while the enrollment URL doesn't load
// (live check of the enrollment domain setting): every kit-v2 QR would lead there.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const [settings, log] = await Promise.all([getNopFlyerSettings(), listNopFlyerSettingsLog()])
  return NextResponse.json({ ...settings, agentAreaReady: AGENT_AREA_READY, log }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
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
  if (body.agentKit === "v2") {
    const domain = await getEnrollDomain()
    const live = await checkEnrollDomain(domain)
    if (!live.ok) {
      const failed = live.checks.filter((c) => !c.ok).map((c) => `${c.url} (${c.error ?? `HTTP ${c.status}`})`).join(", ")
      return NextResponse.json({ error: "enroll_url_not_loading", message: `Not switched: the enrollment URL doesn't load right now: ${failed}. Confirm the URL with the Neighborhood Outreach Program and set the enrollment domain first.`, checks: live.checks }, { status: 409 })
    }
  }
  const change = { spanishV2: body.spanishV2 as boolean | undefined, agentKit: body.agentKit as "v1" | "v2" | undefined }
  const before = await getNopFlyerSettings()
  const settings = await setNopFlyerSetting(change)
  await logNopFlyerSettingChange({ admin: auth.admin, change: JSON.parse(JSON.stringify(change)), before, after: settings })
  console.log(`[nop] ${auth.admin} set flyer settings ${JSON.stringify(body)}`)
  await audit(auth, "flyer_settings", JSON.stringify(body))
  return NextResponse.json({ ...settings, agentAreaReady: AGENT_AREA_READY })
}
