import { NextResponse, type NextRequest } from "next/server"
import { agentPlatformEnabled, apOff } from "@/lib/ap/flag"
import { resolveQrCode } from "@/lib/ap/store"
import { enrollmentUrlFor } from "@/lib/ap/validate"

// GET /ap/q/{code} — what a platform agent's flyer QR encodes. 302, no-store:
// an active agent of a non-paused org forwards to their own enrollment URL,
// anyone else to their org's program page. An unknown code is a 404 (it
// belongs to no org, so there's no program page to send it to).
export const dynamic = "force-dynamic"

const forward = (url: string) => NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } })

async function handle(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!agentPlatformEnabled()) return apOff()
  const hit = await resolveQrCode((await params).code).catch(() => null)
  if (!hit) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } })
  const { agent, org } = hit
  return forward(agent.status === "active" && org.status !== "paused" ? enrollmentUrlFor(org.enrollment, agent.externalId) : org.enrollment.programUrl)
}

export const GET = handle
export const HEAD = handle
