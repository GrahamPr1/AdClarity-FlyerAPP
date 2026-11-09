import { NextResponse, type NextRequest } from "next/server"
import { get } from "@vercel/blob"
import { AGENT_PHOTO_PREFIX, agentPageFor } from "@/lib/enterprise/portal/agent-page"

// GET /p/{code}/photo — the agent's photo, only while their page exists AND
// the org's photo switch is on (agentPageFor returns photo: null otherwise).
// Checked on every request and never cached, so switching photos off removes
// them at once. Anything else is the same 404 as an unknown code.
export const dynamic = "force-dynamic"

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } })

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const page = await agentPageFor(code).catch(() => null)
  const photo = page?.photo
  if (!photo || !photo.path.startsWith(AGENT_PHOTO_PREFIX)) return notFound()
  const result = await get(photo.path, { access: "private" }).catch(() => null)
  if (!result?.stream) return notFound()
  return new NextResponse(result.stream, {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" },
  })
}
