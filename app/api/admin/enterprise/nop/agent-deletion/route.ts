import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { AGENT_ID_RE } from "@/lib/enterprise/nop-roster"
import { deleteAgentAccount, summarizeAgentAccount } from "@/lib/enterprise/agent-account-deletion"

// /api/admin/enterprise/nop/agent-deletion — the owner or a program admin.
//   GET  ?agentId=…                                      what a deletion would remove
//   POST { agentId, confirmAgentId, confirm: true }      deletes the agent's account (agent-account-deletion.ts);
//                                                        the admin types the Agent ID again to confirm. Logged.
// A paid Pro subscription is cancelled and the unused part refunded first; if Stripe refuses, nothing is deleted.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const agentId = request.nextUrl.searchParams.get("agentId") ?? ""
  if (!AGENT_ID_RE.test(agentId)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  const summary = await summarizeAgentAccount(agentId)
  if (!summary) return NextResponse.json({ error: "not_found", message: "Nothing is stored for this Agent ID." }, { status: 404 })
  return NextResponse.json({ summary }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const body = (await request.json().catch(() => null)) as { agentId?: unknown; confirmAgentId?: unknown; confirm?: unknown } | null
  const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : ""
  if (!AGENT_ID_RE.test(agentId)) return NextResponse.json({ error: "invalid" }, { status: 400 })
  if (body?.confirm !== true || body.confirmAgentId !== agentId) {
    return NextResponse.json({ error: "confirm_required", message: "Type the Agent ID to confirm." }, { status: 400 })
  }
  const out = await deleteAgentAccount(agentId, { by: auth.admin, reason: "admin", note: "deleted by an admin on request" })
  if (!out.ok) {
    const message = out.reason === "not_found" ? "Nothing is stored for this Agent ID." : `Stripe refused to cancel the paid Pro subscription, so nothing was deleted. Finish it in Stripe, then try again. (${out.message})`
    return NextResponse.json({ error: out.reason, message }, { status: out.reason === "not_found" ? 404 : 502 })
  }
  const d = out.deletion
  await audit(auth, "agent.delete_account", `agent ${agentId}: ${d.leads} leads, ${d.events} events${d.billing?.cancelled ? `, Pro cancelled, ${d.billing.refunded} cents refunded` : ""}`)
  return NextResponse.json({ ok: true, deletion: d })
}
