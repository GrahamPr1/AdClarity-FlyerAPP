import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { listRoster } from "@/lib/enterprise/agents-store"
import { AGENT_ID_RE } from "@/lib/enterprise/nop-roster"
import { deleteAgentLeads, listAgentLeadIds, listAgentLeads, listLeadDeletions, type DeletionRequester } from "@/lib/enterprise/portal/agent-data"
import { getRetentionClock } from "@/lib/enterprise/portal/retention"

// /api/admin/enterprise/nop/lead-deletions — OneFlyer admin only. Deleting
// agent leads before the retention clock runs out, on request.
//   GET ?q=<phone or email>     a person's leads, across every agent
//   GET ?agentId=<id>           one agent's leads (a Basic Benefits request), plus their retention clock
//   GET                         the deletion log
//   POST { agentId, leadIds: [...] | "all", expectedCount, requestedBy, note, confirm: true }
// Every deletion is logged (admin, Agent ID, lead ids, who asked, note, time);
// the log keeps no names, phones or emails.
export const dynamic = "force-dynamic"

const REQUESTERS: DeletionRequester[] = ["person", "basic_benefits"]
const digits = (v: string) => v.replace(/\D/g, "")
const brief = (l: { id: string; name: string; phone: string; email: string | null; createdAt: string }) => ({ id: l.id, name: l.name, phone: l.phone, email: l.email, createdAt: l.createdAt })

export async function GET(request: NextRequest) {
  const a = await requireNopAdmin(request)
  if ("response" in a) return a.response
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  const agentId = request.nextUrl.searchParams.get("agentId")?.trim() ?? ""
  const headers = { "Cache-Control": "no-store" }

  if (agentId) {
    if (!AGENT_ID_RE.test(agentId)) return NextResponse.json({ error: "invalid" }, { status: 400 })
    const [leads, retention] = await Promise.all([listAgentLeads(agentId), getRetentionClock(agentId)])
    return NextResponse.json({ matches: leads.map((l) => ({ agentId, lead: brief(l) })), retention }, { headers })
  }
  if (q) {
    const email = q.includes("@") ? q.toLowerCase() : null
    const phone = email ? "" : digits(q)
    if (!email && phone.length < 7) return NextResponse.json({ error: "invalid", message: "Search by a full phone number or email address." }, { status: 400 })
    const matches: { agentId: string; agentName: string; lead: ReturnType<typeof brief> }[] = []
    for (const r of await listRoster()) {
      for (const l of await listAgentLeads(r.agentId)) {
        if ((email && l.email?.toLowerCase() === email) || (phone && digits(l.phone).endsWith(phone.slice(-10)))) matches.push({ agentId: r.agentId, agentName: r.agentName, lead: brief(l) })
      }
    }
    return NextResponse.json({ matches }, { headers })
  }
  return NextResponse.json({ deletions: await listLeadDeletions() }, { headers })
}

export async function POST(request: NextRequest) {
  const a = await requireNopAdmin(request)
  if ("response" in a) return a.response
  const body = (await request.json().catch(() => null)) as { agentId?: unknown; leadIds?: unknown; expectedCount?: unknown; requestedBy?: unknown; note?: unknown; confirm?: unknown } | null
  const agentId = typeof body?.agentId === "string" ? body.agentId : ""
  const requestedBy = body?.requestedBy as DeletionRequester
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : ""
  if (!AGENT_ID_RE.test(agentId) || !REQUESTERS.includes(requestedBy)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  if (body?.confirm !== true) return NextResponse.json({ error: "confirm_required", message: "Confirm the deletion." }, { status: 400 })

  let ids: string[]
  if (body.leadIds === "all") {
    ids = await listAgentLeadIds(agentId)
    if (ids.length !== body.expectedCount) return NextResponse.json({ error: "stale", message: "This agent's leads changed since you looked. Check again." }, { status: 409 })
  } else if (Array.isArray(body.leadIds) && body.leadIds.length > 0 && body.leadIds.every((x) => typeof x === "string")) {
    ids = body.leadIds as string[]
  } else {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
  const done = await deleteAgentLeads(a.admin, agentId, ids, requestedBy, note)
  if (!done) return NextResponse.json({ error: "not_found", message: "None of those leads belong to that Agent ID." }, { status: 404 })
  await audit(a, "lead_deletion", `${done.leadIds.length} lead(s) of agent ${agentId}`)
  return NextResponse.json({ deletion: done })
}
