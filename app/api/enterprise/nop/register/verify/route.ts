import { NextRequest, NextResponse } from "next/server"
import { registrationRateLimit, requireClientSession } from "@/lib/enterprise/agent-session"
import { AGENT_ID_NOT_RECOGNIZED } from "@/lib/enterprise/registration-messages"
import {
  MAX_CODE_ATTEMPTS,
  clearRegistration,
  getRegistration,
  getRosterRecord,
  hashVerificationCode,
  setRegistration,
} from "@/lib/enterprise/agents-store"

// POST /api/enterprise/nop/register/verify { code }
//
// Returns what the confirmation screen (step d) shows: the name and ID ON
// FILE, so an agent who typed the wrong ID sees someone else's name.
export async function POST(request: NextRequest) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response
  const { email: account } = auth

  const limited = await registrationRateLimit(request, account, "verify")
  if (limited) return limited

  const state = await getRegistration(account)
  if (!state || state.step !== "code" || !state.codeHash) {
    return NextResponse.json({ error: "no_registration", message: "Start again by entering your Agent ID." }, { status: 409 })
  }

  let code: string
  try {
    code = String(((await request.json()) as { code?: unknown }).code ?? "").replace(/\s/g, "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if ((await hashVerificationCode(account, state.agentId, code)) !== state.codeHash) {
    const attempts = state.codeAttempts + 1
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await clearRegistration(account)
      return NextResponse.json({ error: "too_many_attempts", message: "Too many incorrect codes. Start again." }, { status: 429 })
    }
    await setRegistration(account, { ...state, codeAttempts: attempts })
    return NextResponse.json({ error: "wrong_code", message: "That code isn't right. Check the email and try again." }, { status: 400 })
  }

  const roster = await getRosterRecord(state.agentId)
  if (!roster) {
    await clearRegistration(account)
    return NextResponse.json({ error: "not_recognized", message: AGENT_ID_NOT_RECOGNIZED }, { status: 404 })
  }
  await setRegistration(account, { agentId: state.agentId, step: "verified", codeAttempts: 0 })
  return NextResponse.json({
    ok: true,
    step: "verified",
    agentId: roster.agentId,
    agentName: roster.agentName,
    defaults: { displayName: roster.agentName, displayPhone: roster.rosterPhone, displayEmail: roster.rosterEmail },
  })
}
