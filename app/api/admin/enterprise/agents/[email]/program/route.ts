import { NextRequest, NextResponse } from "next/server"
import { listAgentRows, requireAdmin } from "@/lib/enterprise/portal/admin"
import { reactivateInProgram, removeFromProgram } from "@/lib/enterprise/agent-membership"

// POST /api/admin/enterprise/agents/{email}/program { action: "remove" | "reactivate" }
// Admin only. Remove from program (terminated + the 12-month lead retention
// clock) or Undo it. Both logged with the admin (agent-membership.ts).
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const email = decodeURIComponent((await params).email).trim().toLowerCase()
  let action: unknown
  try {
    action = ((await request.json()) as { action?: unknown }).action
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (action !== "remove" && action !== "reactivate") return NextResponse.json({ error: "action must be remove or reactivate" }, { status: 422 })
  const row = (await listAgentRows()).find((r) => r.email === email)
  if (!row) return NextResponse.json({ error: "Not an agent account" }, { status: 404 })
  const out = action === "remove" ? await removeFromProgram(row.agentId, auth.admin) : await reactivateInProgram(row.agentId, auth.admin)
  if (!out.ok) {
    const message = { no_roster_record: "This agent has no roster record.", already_removed: "Already removed from the program.", not_removed: "This agent isn't removed." }[out.reason]
    return NextResponse.json({ error: out.reason, message }, { status: 409 })
  }
  return NextResponse.json(out)
}
