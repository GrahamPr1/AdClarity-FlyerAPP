import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { isNopTemplate } from "@/lib/enterprise/nop-render/kit"
import { NopRenderError, renderNopFlyer, type NopFormat } from "@/lib/enterprise/nop-render/render"
import { isNopV2Template } from "@/lib/enterprise/nop-render/kit-v2"
import { renderNopV2, renderNopV2ForAgent } from "@/lib/enterprise/nop-render/render-v2"
import { getAgentIdOwner } from "@/lib/enterprise/agents-store"
import { loadNopAgent } from "@/lib/enterprise/nop-render/agent-context"
import { logNopRender } from "@/lib/enterprise/nop-render/log"
import { v2VersionStamp } from "@/lib/enterprise/nop-render/kit-v2"

// GET /api/admin/enterprise/nop/render-check?template=NOP_P2_EN&format=print
// GET /api/admin/enterprise/nop/render-check?template=NOP2_P1_EN_PRICE&format=letter|bleed|preview
//   Kit v2 (Basic Benefits' final flyers), as supplied, without an agent area.
//   Includes Spanish, whatever the agent switch says: this is admin-only.
// GET ...?template=NOP2_P1_EN_PRICE&format=letter|bleed&agentId=990002
//   Kit v2 for a real, active roster agent: exactly the file that agent would
//   download (renderNopV2ForAgent, every release check), so it can be printed
//   and scanned before agents are switched to kit v2. Issues the agent's code
//   if they have none, as their first flyer would. Written to the generation
//   log under the admin's account, since it carries the agent's details.
//
// Admin-only, kept permanently: renders a template through the exact agent
// pipeline (fonts, fitting, QR gate) with a fixed test agent, so the output
// can be checked on any deployment — e.g. `pdffonts` on a Vercel preview to
// prove Poppins is embedded on the real runtime. Needs no roster or agent
// account, and is NOT written to the generation log: no agent produced it.

export const maxDuration = 60
export const dynamic = "force-dynamic"

const TEST_AGENT = {
  agentId: "858980",
  displayName: "Render Check Agent",
  displayPhone: "(270) 555-0100",
  displayEmail: "render-check@oneflyer.org",
}

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const template = url.searchParams.get("template") ?? "NOP_P2_EN"
  const format = (url.searchParams.get("format") ?? "print") as NopFormat
  if (isNopV2Template(template)) {
    const size = url.searchParams.get("format") ?? "letter"
    if (!["letter", "bleed", "preview"].includes(size)) return NextResponse.json({ error: "format must be letter, bleed or preview" }, { status: 422 })
    const agentId = url.searchParams.get("agentId")?.trim()
    if (agentId) {
      const owner = await getAgentIdOwner(agentId)
      const agent = owner ? await loadNopAgent(owner) : null
      if (!agent) return NextResponse.json({ error: "no_agent", message: `No registered agent account holds Agent ID ${agentId}.` }, { status: 404 })
      if (!agent.active) return NextResponse.json({ error: "not_active", message: `Agent ${agentId} is ${agent.status ?? "not on the roster"}.` }, { status: 409 })
      try {
        const values = { agentId, displayName: agent.profile.displayName ?? agent.profile.name, displayPhone: agent.profile.displayPhone ?? agent.profile.phone }
        const r = await renderNopV2ForAgent(template, size === "bleed" ? "bleed" : "letter", values, size === "preview" ? "preview" : "pdf")
        if (size !== "preview") await logNopRender({ agentId, account: `admin:${session!.sub}`, template, format: size === "bleed" ? "print" : "home", kitVersion: `v2 ${v2VersionStamp(template)}` })
        const ext = r.contentType === "application/pdf" ? "pdf" : "png"
        return new NextResponse(new Uint8Array(r.body), {
          headers: {
            "Content-Type": r.contentType,
            "Content-Disposition": `attachment; filename="${template}_${agentId}_${size}.${ext}"`,
            "Cache-Control": "no-store",
            "X-Render-Ms": String(r.ms),
            "X-Render-Qr": r.qr,
            "X-Render-Page-Points": r.pagePoints ? `${r.pagePoints.w}x${r.pagePoints.h}` : "",
          },
        })
      } catch (err) {
        const code = err instanceof NopRenderError ? err.code : "render_failed"
        return NextResponse.json({ error: code, message: err instanceof Error ? err.message : String(err) }, { status: code === "field_too_long" ? 422 : 500 })
      }
    }
    try {
      const r = await renderNopV2(template, size === "bleed" ? "bleed" : "letter", size === "preview" ? "preview" : "pdf")
      const ext = r.contentType === "application/pdf" ? "pdf" : "png"
      return new NextResponse(new Uint8Array(r.body), {
        headers: {
          "Content-Type": r.contentType,
          "Content-Disposition": `attachment; filename="render-check_${template}_${size}.${ext}"`,
          "Cache-Control": "no-store",
          "X-Render-Ms": String(r.ms),
          "X-Render-Page-Points": r.pagePoints ? `${r.pagePoints.w}x${r.pagePoints.h}` : "",
          "X-Render-Fonts": r.usedFonts.join(","),
          "X-Render-Platform": process.platform,
        },
      })
    } catch (err) {
      const code = err instanceof NopRenderError ? err.code : "render_failed"
      return NextResponse.json({ error: code, message: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
  }
  if (!isNopTemplate(template)) return NextResponse.json({ error: "unknown template" }, { status: 422 })
  if (!["preview", "print", "home", "social"].includes(format)) return NextResponse.json({ error: "unknown format" }, { status: 422 })

  try {
    const r = await renderNopFlyer(template, TEST_AGENT, format)
    return new NextResponse(new Uint8Array(r.body), {
      headers: {
        "Content-Type": r.contentType,
        "Content-Disposition": `attachment; filename="render-check_${template}_${format}.${r.contentType === "application/pdf" ? "pdf" : "png"}"`,
        "Cache-Control": "no-store",
        "X-Render-Ms": String(r.ms),
        "X-Render-Qr": r.qr,
        "X-Render-Platform": process.platform,
      },
    })
  } catch (err) {
    const code = err instanceof NopRenderError ? err.code : "render_failed"
    return NextResponse.json({ error: code, message: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
