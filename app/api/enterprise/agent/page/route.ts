import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { canUse } from "@/lib/enterprise/portal/features"
import { getAgentQrCode, getOrIssueAgentQrCode } from "@/lib/enterprise/nop-qr-code"
import { checkBookingUrl, getAgentPageSettings, nopPageLink, saveBookingUrl, type AgentPageSettings } from "@/lib/enterprise/portal/agent-page"

// GET   /api/enterprise/agent/page -> the agent's page link and settings
// PATCH /api/enterprise/agent/page { bookingUrl } -> save (blank clears it)
//
// Only for an active Pro/Leader agent whose org has the agent page on. An
// admin viewing as the agent may read but never write, and their view never
// issues a code: an agent with none yet just has no link to show.
export const dynamic = "force-dynamic"

function view(settings: AgentPageSettings, photoAllowed: boolean) {
  return { bookingUrl: settings.bookingUrl, hasPhoto: photoAllowed && !!settings.photo, photoAllowed }
}

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "agentPage")
  if ("response" in r) return r.response
  const agentId = r.ctx.agent.agentId
  const code = r.viewer.viewAs ? await getAgentQrCode(agentId) : await getOrIssueAgentQrCode(agentId)
  const settings = await getAgentPageSettings(agentId)
  return NextResponse.json(
    { link: code ? nopPageLink(code) : null, ...view(settings, canUse(r.ctx, "agentPhoto")) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "agentPage")
  if ("response" in r) return r.response
  const body = (await request.json().catch(() => null)) as { bookingUrl?: unknown } | null
  if (!body || !("bookingUrl" in body)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const booking = checkBookingUrl(body.bookingUrl)
  if (!booking.ok) return NextResponse.json({ error: "booking_not_allowed" }, { status: 422 })
  const settings = await saveBookingUrl(r.ctx.agent.agentId, booking.url)
  return NextResponse.json(view(settings, canUse(r.ctx, "agentPhoto")))
}
