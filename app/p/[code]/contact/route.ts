import { NextResponse, type NextRequest } from "next/server"
import { get } from "@vercel/blob"
import { AGENT_PHOTO_PREFIX, agentPageFor, nopPageLink } from "@/lib/enterprise/portal/agent-page"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { buildVCard, vcardFileName } from "@/lib/enterprise/portal/vcard"

// GET /p/{code}/contact — "Save my contact": the agent's contact card (vCard)
// with their name, phone, email and page link, and the photo only while the
// org's photo switch is on. Exists exactly when the page does (agentPageFor);
// anything else is the same 404 as an unknown code. Never cached.
export const dynamic = "force-dynamic"

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } })
const MAX_PHOTO_BYTES = 1_000_000

async function photoBase64(path: string, contentType: string): Promise<{ base64: string; type: "JPEG" | "PNG" } | null> {
  const type = contentType === "image/jpeg" ? "JPEG" : contentType === "image/png" ? "PNG" : null
  if (!type || !path.startsWith(AGENT_PHOTO_PREFIX)) return null
  const result = await get(path, { access: "private" }).catch(() => null)
  if (!result?.stream) return null
  const buf = Buffer.from(await new Response(result.stream).arrayBuffer())
  return buf.length <= MAX_PHOTO_BYTES ? { base64: buf.toString("base64"), type } : null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const page = await agentPageFor(code).catch(() => null)
  if (!page) return notFound()
  const card = buildVCard({
    name: page.name, phone: page.phone, email: page.email, pageUrl: nopPageLink(code), org: NOP_ORG_NAME,
    photo: page.photo ? await photoBase64(page.photo.path, page.photo.contentType) : null,
  })
  return new NextResponse(card, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcardFileName(page.name)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  })
}
