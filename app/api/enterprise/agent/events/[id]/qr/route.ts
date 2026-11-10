import { NextRequest, NextResponse } from "next/server"
import QRCode from "qrcode"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { eventLink, getEvent } from "@/lib/enterprise/portal/events"

// GET /api/enterprise/agent/events/{id}/qr?format=png|svg -> a QR for the event page (/e/{code}), as a download.
// Not a flyer: event flyers wait for the program's template.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAgentFeature(request, "events")
  if ("response" in r) return r.response
  const event = await getEvent((await params).id)
  if (!event || event.agentId !== r.ctx.agent.agentId) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const link = eventLink(event.code)
  const svg = request.nextUrl.searchParams.get("format") === "svg"
  const headers = { "Content-Disposition": `attachment; filename="event-qr-${event.code}.${svg ? "svg" : "png"}"`, "Cache-Control": "no-store" }
  const opts = { errorCorrectionLevel: "M" as const, margin: 4 }
  if (svg) return new NextResponse(await QRCode.toString(link, { ...opts, type: "svg" }), { headers: { ...headers, "Content-Type": "image/svg+xml" } })
  const png = await QRCode.toBuffer(link, { ...opts, type: "png", width: 1200 })
  return new NextResponse(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } })
}
