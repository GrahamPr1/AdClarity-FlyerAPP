import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { cancelEvent, checkEventInput, eventLink, getEvent, updateEvent } from "@/lib/enterprise/portal/events"
import { listAgentLeads } from "@/lib/enterprise/portal/agent-data"
import { isRsvp } from "@/lib/enterprise/portal/lead-tracker"

// GET    /api/enterprise/agent/events/{id} -> the event and its RSVP count
// PATCH  /api/enterprise/agent/events/{id} {…same fields as create} -> the updated event
// DELETE /api/enterprise/agent/events/{id} -> cancelled (kept, with its RSVPs; the page says so)
// Only the agent's own events; 404 for anyone else's.
export const dynamic = "force-dynamic"

async function load(request: NextRequest, id: string) {
  const r = await requireAgentFeature(request, "events")
  if ("response" in r) return r
  const event = await getEvent(id)
  if (!event || event.agentId !== r.ctx.agent.agentId) return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) }
  return { ...r, event }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load(request, (await params).id)
  if ("response" in r) return r.response
  const forEvent = (await listAgentLeads(r.ctx.agent.agentId)).filter((l) => l.eventId === r.event.id)
  const rsvps = forEvent.filter(isRsvp)
  return NextResponse.json({ event: { ...r.event, link: eventLink(r.event.code) }, rsvps: rsvps.length, guests: rsvps.reduce((n, l) => n + 1 + (l.guests ?? 0), 0) }, { headers: { "Cache-Control": "no-store" } })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await load(request, (await params).id)
  if ("response" in r) return r.response
  if (r.event.cancelledAt) return NextResponse.json({ error: "cancelled" }, { status: 409 })
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const check = checkEventInput(body)
  if (!check.ok) return NextResponse.json({ error: "invalid_fields", fields: check.errors }, { status: 422 })
  const event = await updateEvent(r.event, check.value)
  return NextResponse.json({ event: { ...event, link: eventLink(event.code) } })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await load(request, (await params).id)
  if ("response" in r) return r.response
  const event = r.event.cancelledAt ? r.event : await cancelEvent(r.event)
  return NextResponse.json({ event: { ...event, link: eventLink(event.code) } })
}
