import { NextRequest, NextResponse } from "next/server"
import { sendAgentVerificationCode } from "@/lib/email"
import { registrationRateLimit, requireClientSession } from "@/lib/enterprise/agent-session"
import { NOP_ORG_NAME, maskEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { AGENT_ID_NOT_RECOGNIZED, EMAIL_MISMATCH } from "@/lib/enterprise/registration-messages"
import { addAgentFlag, clearRegistration, getRegistration, getRosterRecord, hashVerificationCode, setRegistration } from "@/lib/enterprise/agents-store"

// POST /api/enterprise/nop/register/email { email }
//
// Steps (b) and (c). The typed email must match the roster; the code is then
// sent to the roster email ON FILE, not to what was typed. Calling this again
// from the code step re-sends a fresh code.
export async function POST(request: NextRequest) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response
  const { email: account } = auth

  const limited = await registrationRateLimit(request, account, "email")
  if (limited) return limited

  const state = await getRegistration(account)
  if (!state || state.step === "verified") {
    return NextResponse.json({ error: "no_registration", message: "Start again by entering your Agent ID." }, { status: 409 })
  }

  let typed: string
  try {
    typed = normalizeEmail(String(((await request.json()) as { email?: unknown }).email ?? ""))
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const roster = await getRosterRecord(state.agentId)
  if (!roster) {
    await clearRegistration(account)
    return NextResponse.json({ error: "not_recognized", message: AGENT_ID_NOT_RECOGNIZED }, { status: 404 })
  }

  if (typed !== roster.rosterEmail) {
    // Ends the attempt: retrying emails against a known ID is exactly the
    // guessing this step exists to stop.
    await clearRegistration(account)
    await addAgentFlag({ type: "email_mismatch", agentId: state.agentId, account, attemptedEmail: typed })
    return NextResponse.json({ error: "email_mismatch", message: EMAIL_MISMATCH }, { status: 403 })
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0")
  const sent = await sendAgentVerificationCode(roster.rosterEmail, code, NOP_ORG_NAME)
  if (!sent) {
    return NextResponse.json({ error: "send_failed", message: "We couldn't send the code. Try again in a moment." }, { status: 502 })
  }
  await setRegistration(account, { agentId: state.agentId, step: "code", codeHash: await hashVerificationCode(account, state.agentId, code), codeAttempts: 0 })
  return NextResponse.json({ ok: true, step: "code", sentTo: maskEmail(roster.rosterEmail) })
}
