import { NextRequest, NextResponse } from "next/server"
import { saveAgentProfile } from "@/lib/store"
import { requireClientSession } from "@/lib/enterprise/agent-session"
import { validateDisplayFields } from "@/lib/enterprise/nop-roster"
import { AGENT_ID_INACTIVE, AGENT_ID_NOT_RECOGNIZED, AGENT_ID_TAKEN } from "@/lib/enterprise/registration-messages"
import {
  addAgentFlag,
  buildAgentProfile,
  clearRegistration,
  getRegistration,
  getRosterRecord,
  lockAgentId,
} from "@/lib/enterprise/agents-store"

// POST /api/enterprise/nop/register/confirm { displayName, displayPhone, displayEmail }
//
// Step (e). The lock is the SET NX inside lockAgentId — the single point that
// decides who owns an Agent ID. Everything before it was advisory.
export async function POST(request: NextRequest) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response
  const { email: account } = auth

  const state = await getRegistration(account)
  if (!state || state.step !== "verified") {
    return NextResponse.json({ error: "no_registration", message: "Start again by entering your Agent ID." }, { status: 409 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const display = validateDisplayFields(body)
  if (!display.ok) return NextResponse.json({ error: "invalid_fields", fields: display.errors }, { status: 422 })

  // Re-read: the roster may have been re-imported since verification.
  const roster = await getRosterRecord(state.agentId)
  if (!roster) {
    await clearRegistration(account)
    return NextResponse.json({ error: "not_recognized", message: AGENT_ID_NOT_RECOGNIZED }, { status: 404 })
  }
  if (roster.status === "suspended" || roster.status === "terminated") {
    await clearRegistration(account)
    return NextResponse.json({ error: "inactive", message: AGENT_ID_INACTIVE }, { status: 403 })
  }

  const lock = await lockAgentId(roster.agentId, account)
  if (!lock.ok) {
    await clearRegistration(account)
    if (lock.reason === "id_taken") {
      await addAgentFlag({ type: "id_already_registered", agentId: roster.agentId, account, heldBy: lock.heldBy })
      return NextResponse.json({ error: "id_taken", message: AGENT_ID_TAKEN }, { status: 409 })
    }
    return NextResponse.json(
      { error: "account_registered", message: `This account is already registered as Agent ID ${lock.agentId}.` },
      { status: 409 },
    )
  }

  await saveAgentProfile(account, buildAgentProfile(roster, display.values))
  await clearRegistration(account)
  return NextResponse.json({ ok: true, agentId: roster.agentId })
}
