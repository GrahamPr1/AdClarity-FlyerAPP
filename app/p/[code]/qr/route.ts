import { NextResponse, type NextRequest } from "next/server"
import QRCode from "qrcode"
import { agentPageFor, nopPageLink } from "@/lib/enterprise/portal/agent-page"

// GET /p/{code}/qr — a small QR image of the agent's page link, for their email
// signature (email apps can only show a public image). Exists exactly when the
// page does; anything else is the same 404 as an unknown code. Short cache:
// the image never changes for a code, but the page can be switched off.
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const page = await agentPageFor(code).catch(() => null)
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } })
  const png = await QRCode.toBuffer(nopPageLink(code), { errorCorrectionLevel: "M", margin: 2, type: "png", width: 240 })
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" } })
}
