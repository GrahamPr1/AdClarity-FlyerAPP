import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { getAgentQrCode } from "@/lib/enterprise/nop-qr-code"
import { nopPageLink } from "@/lib/enterprise/portal/agent-page"

// GET /api/enterprise/agent/page/qr?format=png|svg -> a QR for the agent's
// own page (/p/{code}), as a download, for business cards, an email
// signature or social. Not the flyer QR (/a/{code}): this one never goes on
// Basic Benefits' package flyers. Never issues a code; the portal page's GET
// already did, the first time the agent opened it.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "agentPage")
  if ("response" in r) return r.response
  const code = await getAgentQrCode(r.ctx.agent.agentId)
  if (!code) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const link = nopPageLink(code)
  const svg = request.nextUrl.searchParams.get("format") === "svg"
  const name = `my-page-qr.${svg ? "svg" : "png"}`
  const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" }
  const opts = { errorCorrectionLevel: "M" as const, margin: 4 }
  if (svg) return new NextResponse(await QRCode.toString(link, { ...opts, type: "svg" }), { headers: { ...headers, "Content-Type": "image/svg+xml" } })
  const png = await QRCode.toBuffer(link, { ...opts, type: "png", width: 1200 })
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } })
}
