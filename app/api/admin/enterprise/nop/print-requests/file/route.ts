import { NextRequest, NextResponse } from "next/server"
import { requireNopAdmin } from "@/lib/enterprise/program-admins"
import { findAgentPrintRequest } from "@/lib/enterprise/portal/print-requests"
import { loadNopAgent } from "@/lib/enterprise/nop-render/agent-context"
import { isNopTemplate, readKitContent } from "@/lib/enterprise/nop-render/kit"
import { isNopV2Template, v2VersionStamp } from "@/lib/enterprise/nop-render/kit-v2"
import { renderNopV2ForAgent } from "@/lib/enterprise/nop-render/render-v2"
import { renderNopFlyer } from "@/lib/enterprise/nop-render/render"
import { logNopRender } from "@/lib/enterprise/nop-render/log"

// GET /api/admin/enterprise/nop/print-requests/file?email=…&id=… — the owner or a program admin.
// The print-shop file for one agent print request: that agent's own flyer (their details, their
// QR), print format. Only while the agent is active. Logged in the download record like any
// download, with the admin as the account that asked for it.
export const maxDuration = 60
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const email = (request.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase()
  const id = request.nextUrl.searchParams.get("id") ?? ""
  const req = email && id ? await findAgentPrintRequest(email, id) : null
  if (!req) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const agent = await loadNopAgent(email)
  if (!agent) return NextResponse.json({ error: "not_registered" }, { status: 404 })
  if (!agent.active) return NextResponse.json({ error: "not_active", message: "This agent isn't active, so their flyer can't be printed." }, { status: 409 })

  const template = req.flyerId
  const values = {
    agentId: agent.agentId,
    displayName: agent.profile.displayName ?? agent.profile.name,
    displayPhone: agent.profile.displayPhone ?? agent.profile.phone,
    displayEmail: agent.profile.displayEmail ?? agent.profile.email,
  }
  let rendered
  try {
    if (isNopV2Template(template)) rendered = await renderNopV2ForAgent(template, "bleed", values, "pdf")
    else if (isNopTemplate(template)) rendered = await renderNopFlyer(template, values, "print")
    else return NextResponse.json({ error: "unknown_template" }, { status: 404 })
  } catch (err) {
    console.error(`[nop-print] print file ${template} for agent ${agent.agentId} failed:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "render_failed", message: "Couldn't make the print file. Try again." }, { status: 500 })
  }
  const kitVersion = isNopV2Template(template) ? `v2 ${v2VersionStamp(template)}` : readKitContent().program.kit_version
  await logNopRender({ agentId: agent.agentId, account: auth.admin, template, format: "print", kitVersion })
  const ext = rendered.contentType === "application/pdf" ? "pdf" : "png"
  return new NextResponse(new Uint8Array(rendered.body), {
    headers: {
      "Content-Type": rendered.contentType,
      "Content-Disposition": `attachment; filename="${template}_${agent.agentId}_print_${req.quantity}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
