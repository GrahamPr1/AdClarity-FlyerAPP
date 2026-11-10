import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { getOrCreateRecruitCode, recruitLink } from "@/lib/enterprise/portal/recruiting"

// GET /api/enterprise/agent/recruit/qr?format=png|svg -> a QR for the agent's recruit link, as a download.
// Not a flyer: recruiting flyers wait for the program's template.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "recruiting")
  if ("response" in r) return r.response
  const code = await getOrCreateRecruitCode(r.ctx.agent.agentId)
  const link = recruitLink(code)
  const svg = request.nextUrl.searchParams.get("format") === "svg"
  const headers = { "Content-Disposition": `attachment; filename="recruit-qr-${code}.${svg ? "svg" : "png"}"`, "Cache-Control": "no-store" }
  const opts = { errorCorrectionLevel: "M" as const, margin: 4 }
  if (svg) return new NextResponse(await QRCode.toString(link, { ...opts, type: "svg" }), { headers: { ...headers, "Content-Type": "image/svg+xml" } })
  const png = await QRCode.toBuffer(link, { ...opts, type: "png", width: 1200 })
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } })
}
