import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { isNopTemplate } from "@/lib/enterprise/nop-render/kit"
import { NopRenderError, renderNopFlyer, type NopFormat } from "@/lib/enterprise/nop-render/render"
import { RENDER_CHECK_AGENT } from "@/lib/enterprise/nop-render/test-agent"
import { consumeHealthToken } from "@/lib/health/health-token"

// GET /api/admin/enterprise/nop/render-check?template=NOP_P2_EN&format=print
//
// Site owner only (plus the daily health check's single-use token for one
// template/format; see lib/health/health-token.ts), kept permanently: renders a template through the exact agent
// pipeline (fonts, fitting, QR gate) with a fixed test agent, so the output
// can be checked on any deployment — e.g. `pdffonts` on a Vercel preview to
// prove Poppins is embedded on the real runtime. Needs no roster or agent
// account, and is NOT written to the generation log: no agent produced it.

export const maxDuration = 60
export const dynamic = "force-dynamic"


export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const template = url.searchParams.get("template") ?? "NOP_P2_EN"
  const format = (url.searchParams.get("format") ?? "print") as NopFormat
  // The site owner, or the daily health check with a token for exactly this template and format.
  const session = await getSessionIdentity(request)
  const allowed = (await isAdminSession(session?.sub)) || (await consumeHealthToken(request, { route: "nop-render-check", template, format }))
  if (!allowed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isNopTemplate(template)) return NextResponse.json({ error: "unknown template" }, { status: 422 })
  if (!["preview", "print", "home", "social"].includes(format)) return NextResponse.json({ error: "unknown format" }, { status: 422 })

  try {
    const r = await renderNopFlyer(template, RENDER_CHECK_AGENT, format)
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
