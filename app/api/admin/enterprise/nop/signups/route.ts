import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { approveSignup, decideNameChange, listPendingNameChanges, listPendingSignups, listSignupLog, rejectSignup } from "@/lib/enterprise/agent-signup"
import { sendAgentSignupDecision } from "@/lib/email"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { nameFitsKitV2Footer } from "@/lib/enterprise/nop-render/footer-fit"

// GET  /api/admin/enterprise/nop/signups -> pending self sign-ups, pending name changes, decision log
// POST /api/admin/enterprise/nop/signups { agentId, action: "approve" | "reject" | "approve_name" | "reject_name" }
// OneFlyer admin only. Every decision is logged with the admin's account.
export const dynamic = "force-dynamic"

const ACTIONS = ["approve", "reject", "approve_name", "reject_name"] as const

async function state() {
  const [signups, nameChanges, log] = await Promise.all([listPendingSignups(), listPendingNameChanges(), listSignupLog()])
  return {
    signups: signups.map((s) => ({ ...s, nameFits: nameFitsKitV2Footer(s.name) })),
    nameChanges: nameChanges.map((n) => ({ ...n, nameFits: nameFitsKitV2Footer(n.requestedName) })),
    log,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json(await state(), { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  let body: { agentId?: unknown; action?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const agentId = String(body.agentId ?? "")
  const action = body.action as (typeof ACTIONS)[number]
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "unknown action" }, { status: 422 })

  if (action === "approve_name" || action === "reject_name") {
    const out = await decideNameChange(agentId, auth.admin, action === "approve_name")
    if (!out.ok) return NextResponse.json({ error: "not_pending", message: "No name change is waiting for that Agent ID." }, { status: 409 })
    return NextResponse.json(await state())
  }

  const out = action === "approve" ? await approveSignup(agentId, auth.admin) : await rejectSignup(agentId, auth.admin)
  if (!out.ok) return NextResponse.json({ error: "not_pending", message: "That sign-up isn't waiting for a decision (already decided?)." }, { status: 409 })
  const email = await sendAgentSignupDecision({
    to: out.email, name: out.name, lang: out.lang, approved: action === "approve", programName: NOP_ORG_NAME, signInUrl: `${CANONICAL_SITE_URL}/agent/sign-in`,
  })
  if (!email.sent) console.error(`[nop] ${action} email to agent ${agentId} not sent: ${email.reason}`)
  return NextResponse.json({ ...(await state()), emailSent: email.sent })
}
