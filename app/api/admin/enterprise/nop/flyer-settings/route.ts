import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { AGENT_AREA_READY, getNopFlyerSettings, listNopFlyerSettingsLog, logNopFlyerSettingChange, setNopFlyerSetting } from "@/lib/enterprise/nop-render/kit-v2-access"
import { checkEnrollTargets, getCheckAgentId, getEnrollTargets, getSavedEnrollSettings } from "@/lib/enterprise/nop-enroll-domain"
import { checkEnrollPage } from "@/lib/enterprise/nop-enroll-check"
import { qrDestinationFor } from "@/lib/enterprise/nop-roster"
import { v2ReleaseFailures } from "@/lib/enterprise/nop-render/kit-v2-release"

// GET  /api/admin/enterprise/nop/flyer-settings
// POST /api/admin/enterprise/nop/flyer-settings { spanishV2?: boolean, agentKit?: "v1" | "v2" }
// OneFlyer admin only. Which kit agents get, and the Spanish kit-v2 switch.
// Every change is kept in the settings log (who, when, before and after),
// which GET returns for the admin page.
// Agents can't be switched to kit v2 until the enrollment setting is saved in
// its three-part form, its URLs load, and the check agent's (admin-set,
// default 858980) forward URL shows a real partner page, not "Partner Not Found" (checked in a
// browser: the page is drawn by script). Every kit-v2 QR and printed address
// leads there.
// Spanish kit v2 can't be switched on (or kept on while agents are switched to
// kit v2) while any Spanish template fails the release checks
// (kit-v2-release.ts: 6 templates x 2 sizes rendered with test values).
export const dynamic = "force-dynamic"
// The Spanish release check renders 12 pages; on Vercel each launches its own Chromium.
export const maxDuration = 120

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
    const saved = await getSavedEnrollSettings()
    if (!saved) {
      return NextResponse.json({ error: "enroll_setting_not_saved", message: "Not switched: save the enrollment setting first (forward URL, printed address and program page, above). Until then it's still the old single domain." }, { status: 409 })
    }
    const checkId = await getCheckAgentId()
    const live = await checkEnrollTargets(saved, checkId)
    if (!live.ok) {
      const failed = live.checks.filter((c) => !c.ok).map((c) => `${c.url} (${c.error ?? `HTTP ${c.status}`})`).join(", ")
      return NextResponse.json({ error: "enroll_url_not_loading", message: `Not switched: the enrollment setting's URLs don't load right now: ${failed}. Confirm them with the Neighborhood Outreach Program and save the setting again.`, checks: live.checks }, { status: 409 })
    }
    const page = await checkEnrollPage(qrDestinationFor(checkId, saved))
    if (!page.ok) {
      const why = page.problem === "not_found" ? `shows "${page.text.slice(0, 120)}"` : page.problem === "blank" ? "showed nothing within 20 seconds" : `didn't load (${page.text})`
      return NextResponse.json({ error: "enroll_partner_not_found", message: `Not switched: the check agent's (${checkId}) enrollment page (${page.url}) ${why}. Every kit-v2 QR would lead to a page like it.`, page }, { status: 409 })
    }
  }
  const before = await getNopFlyerSettings()
  // Either switch can make Spanish kit v2 reach agents: Spanish on, or agents moved to kit v2 with Spanish already on.
  const spanishSwitchOn = body.spanishV2 === true && !before.spanishV2
  const kitSwitchWithSpanish = body.agentKit === "v2" && before.agentKit !== "v2" && (body.spanishV2 ?? before.spanishV2)
  if (spanishSwitchOn || kitSwitchWithSpanish) {
    const failures = await v2ReleaseFailures("ES", await getEnrollTargets())
    if (failures.length > 0) {
      const templates = [...new Set(failures.map((f) => f.template))]
      const what = `${templates.length} Spanish kit-v2 flyer${templates.length === 1 ? "" : "s"} fail${templates.length === 1 ? "s" : ""} the release checks (${templates.join(", ")}: ${failures[0].message})`
      return NextResponse.json({
        error: "spanish_v2_fails_release_checks",
        message: spanishSwitchOn
          ? `Not switched: ${what}. Spanish stays off until every Spanish flyer passes.`
          : `Not switched: Spanish kit-v2 flyers are on, and ${what}. Turn Spanish off first, then switch agents to kit v2.`,
        failures,
      }, { status: 409 })
    }
  }
  const change = { spanishV2: body.spanishV2 as boolean | undefined, agentKit: body.agentKit as "v1" | "v2" | undefined }
  const settings = await setNopFlyerSetting(change)
  await logNopFlyerSettingChange({ admin: auth.admin, change: JSON.parse(JSON.stringify(change)), before, after: settings })
  console.log(`[nop] ${auth.admin} set flyer settings ${JSON.stringify(body)}`)
  await audit(auth, "flyer_settings", JSON.stringify(body))
  return NextResponse.json({ ...settings, agentAreaReady: AGENT_AREA_READY })
}
