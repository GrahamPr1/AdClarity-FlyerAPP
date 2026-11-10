import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { checkEventInput, createEvent, eventLink, listAgentEvents } from "@/lib/enterprise/portal/events"

// GET  /api/enterprise/agent/events -> the agent's events, soonest first
// POST /api/enterprise/agent/events {title,date,time,timezone,durationMinutes,locationName,address,details} -> the new event
// Only an active Pro/Leader agent whose org has events on (canUse). Never while an admin views the portal.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "events")
  if ("response" in r) return r.response
  const events = await listAgentEvents(r.ctx.agent.agentId)
  return NextResponse.json({ events: events.map((e) => ({ ...e, link: eventLink(e.code) })) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "events")
  if ("response" in r) return r.response
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const check = checkEventInput(body)
  if (!check.ok) return NextResponse.json({ error: "invalid_fields", fields: check.errors }, { status: 422 })
  const event = await createEvent(r.ctx.agent.agentId, check.value)
  return NextResponse.json({ event: { ...event, link: eventLink(event.code) } })
}
