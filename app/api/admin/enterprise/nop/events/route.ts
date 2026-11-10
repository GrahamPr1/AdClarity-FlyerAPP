import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { listAgentLeads } from "@/lib/enterprise/portal/agent-data"
import { loadPortalContext } from "@/lib/enterprise/portal/context"
import { eventLink, formatEventWhen, getEvent, listAllEvents, setEventHidden, type AgentEvent } from "@/lib/enterprise/portal/events"
import { sendEventHiddenNotice } from "@/lib/email"
import { CANONICAL_SITE_URL } from "@/lib/site-url"

// /api/admin/enterprise/nop/events — the owner or a program admin.
//   GET                                   every event of every agent: agent, title, when, RSVPs, status
//   POST { id, action: "hide" | "unhide" } takes the public page down ("This event isn't available":
//                                         no RSVPs, no reminders) or puts it back. The agent is
//                                         emailed; logged with the admin.
export const dynamic = "force-dynamic"

export type AdminEventStatus = "hidden" | "cancelled" | "ended" | "upcoming"
export interface AdminEventRow {
  id: string
  code: string
  link: string
  agentId: string
  agentName: string | null
  title: string
  when: string
  startsAt: string
  rsvps: number
  guests: number
  status: AdminEventStatus
  hiddenBy: string | null
}

const statusOf = (e: AgentEvent, now: number): AdminEventStatus =>
  e.hiddenAt ? "hidden" : e.cancelledAt ? "cancelled" : Date.parse(e.endsAt) <= now ? "ended" : "upcoming"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const events = await listAllEvents()
  const agentIds = [...new Set(events.map((e) => e.agentId))]
  const [leads, roster] = await Promise.all([
    Promise.all(agentIds.map((id) => listAgentLeads(id))),
    Promise.all(agentIds.map((id) => getRosterRecord(id))),
  ])
  const byAgent = new Map(agentIds.map((id, i) => [id, { leads: leads[i], name: roster[i]?.agentName ?? null }]))
  const now = Date.now()
  const rows: AdminEventRow[] = events.map((e) => {
    const a = byAgent.get(e.agentId)
    const rsvps = (a?.leads ?? []).filter((l) => l.eventId === e.id)
    return {
      id: e.id, code: e.code, link: eventLink(e.code), agentId: e.agentId, agentName: a?.name ?? null, title: e.title,
      when: formatEventWhen(e, "en"), startsAt: e.startsAt, rsvps: rsvps.length, guests: rsvps.reduce((n, l) => n + 1 + (l.guests ?? 0), 0),
      status: statusOf(e, now), hiddenBy: e.hiddenBy ?? null,
    }
  })
  return NextResponse.json({ events: rows }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null
  const action = body?.action
  if (typeof body?.id !== "string" || (action !== "hide" && action !== "unhide")) return NextResponse.json({ error: "invalid", message: "Send an event id and hide or unhide." }, { status: 400 })
  const current = await getEvent(body.id)
  if (!current) return NextResponse.json({ error: "not_found", message: "No such event." }, { status: 404 })
  const hide = action === "hide"
  if (!!current.hiddenAt === hide) return NextResponse.json({ error: "unchanged", message: hide ? "Already hidden." : "It isn't hidden." }, { status: 409 })
  const event = (await setEventHidden(current.id, hide, auth.admin))!
  await audit(auth, hide ? "event.hide" : "event.unhide", `"${event.title}" (${event.code}), agent ${event.agentId}`)

  // Tell the agent. The hide stands even if the email doesn't go out; the reply says so.
  const owner = await getAgentIdOwner(event.agentId)
  const ctx = owner ? await loadPortalContext(owner) : null
  const mail = owner
    ? await sendEventHiddenNotice({ to: owner, lang: ctx?.agent.profile.preferredLanguage ?? "en", title: event.title, hidden: hide, eventUrl: `${CANONICAL_SITE_URL}/agent/events/${event.id}` })
    : { sent: false, reason: "no account holds this Agent ID" }
  if (!mail.sent) console.error(`[nop-events] ${action} notice for event ${event.id} not sent:`, mail.reason)
  return NextResponse.json({ ok: true, hidden: hide, agentEmailed: mail.sent })
}
