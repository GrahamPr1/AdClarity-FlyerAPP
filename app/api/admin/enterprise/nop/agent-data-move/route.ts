import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { AGENT_ID_RE } from "@/lib/enterprise/nop-roster"
import { listAgentDataMoves, moveAgentData, summarizeAgentData } from "@/lib/enterprise/portal/agent-data"
import { getAgentQrCode } from "@/lib/enterprise/nop-qr-code"

// /api/admin/enterprise/nop/agent-data-move — OneFlyer admin only.
//   GET                                           the log of every move
//   POST { from, to, action: "preview" }          what would move (leads, scans) and who holds each ID
//   POST { from, to, action: "move", confirm: true, expected: { leads, scans } }
//                                                 moves it, only if the source still holds exactly
//                                                 what the preview showed; logged with admin and time
// The target must be on the roster. Leads and scans keep their dates; the
// agent's events move too (their RSVPs are among the leads).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  return NextResponse.json({ moves: await listAgentDataMoves() }, { headers: { "Cache-Control": "no-store" } })
}

async function side(agentId: string) {
  const [data, roster, owner, qrCode] = await Promise.all([summarizeAgentData(agentId), getRosterRecord(agentId), getAgentIdOwner(agentId), getAgentQrCode(agentId)])
  // qrCode is shown, never moved: it stays with its Agent ID for good.
  return { agentId, ...data, onRoster: !!roster, name: roster?.agentName ?? null, status: roster?.status ?? null, account: owner, qrCode }
}

export async function POST(request: NextRequest) {
  const a = await requireAdmin(request)
  if ("response" in a) return a.response
  const body = (await request.json().catch(() => null)) as { from?: unknown; to?: unknown; action?: unknown; confirm?: unknown; expected?: { leads?: unknown; scans?: unknown } } | null
  const from = typeof body?.from === "string" ? body.from.trim() : ""
  const to = typeof body?.to === "string" ? body.to.trim() : ""
  if (!AGENT_ID_RE.test(from) || !AGENT_ID_RE.test(to)) return NextResponse.json({ error: "invalid", message: "Both must be Agent IDs (digits only)." }, { status: 400 })
  if (from === to) return NextResponse.json({ error: "same_id", message: "Pick two different Agent IDs." }, { status: 400 })
  if (!(await getRosterRecord(to))) return NextResponse.json({ error: "target_not_on_roster", message: `Agent ID ${to} isn't on the roster.` }, { status: 422 })

  if (body?.action === "preview") return NextResponse.json({ from: await side(from), to: await side(to) })

  if (body?.action !== "move" || body.confirm !== true) return NextResponse.json({ error: "confirm_required", message: "Preview first, then confirm." }, { status: 400 })
  const leads = Number(body.expected?.leads), scans = Number(body.expected?.scans)
  if (!Number.isInteger(leads) || !Number.isInteger(scans) || leads < 0 || scans < 0) return NextResponse.json({ error: "invalid" }, { status: 400 })
  if (leads === 0 && scans === 0 && !(await summarizeAgentData(from)).events) return NextResponse.json({ error: "nothing_to_move", message: "There's nothing to move." }, { status: 422 })

  const r = await moveAgentData(a.admin, from, to, { leads, scans })
  if (!r.ok) return NextResponse.json({ error: r.reason, message: "The data changed since the preview. Preview again." }, { status: 409 })
  return NextResponse.json({ move: r.move })
}
