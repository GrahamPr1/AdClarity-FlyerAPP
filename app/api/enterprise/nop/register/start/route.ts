import { NextRequest, NextResponse } from "next/server"
import { registrationRateLimit, requireClientSession } from "@/lib/enterprise/agent-session"
import { AGENT_ID_RE } from "@/lib/enterprise/nop-roster"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { addAgentFlag, getAccountAgentId, getAgentIdOwner, getRosterRecord, setRegistration } from "@/lib/enterprise/agents-store"

// POST /api/enterprise/nop/register/start { agentId }
//
// Step (a). Only checks; nothing is claimed here. The ownership check below is
// an early, friendly refusal — the authoritative claim is the SET NX in
// /confirm, so a lock taken between this step and that one is still caught.
export async function POST(request: NextRequest) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response
  const { email } = auth
  const lang = await nopLangForRequest(request)

  const limited = await registrationRateLimit(request, email, "start", lang)
  if (limited) return limited

  let agentId: string
  try {
    agentId = String(((await request.json()) as { agentId?: unknown }).agentId ?? "").trim()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!AGENT_ID_RE.test(agentId)) return NextResponse.json({ error: "invalid_format", message: tNop(lang, "err.id_format") }, { status: 422 })

  const already = await getAccountAgentId(email)
  if (already) {
    return NextResponse.json(
      { error: "account_registered", message: tNop(lang, "err.account_registered", { agentId: already }) },
      { status: 409 },
    )
  }

  const roster = await getRosterRecord(agentId)
  if (!roster) return NextResponse.json({ error: "not_recognized", message: tNop(lang, "err.not_recognized") }, { status: 404 })
  if (roster.status === "suspended" || roster.status === "terminated") {
    return NextResponse.json({ error: "inactive", message: tNop(lang, "err.inactive") }, { status: 403 })
  }

  const owner = await getAgentIdOwner(agentId)
  if (owner && owner !== email) {
    await addAgentFlag({ type: "id_already_registered", agentId, account: email, heldBy: owner })
    return NextResponse.json({ error: "id_taken", message: tNop(lang, "err.taken") }, { status: 409 })
  }

  await setRegistration(email, { agentId, step: "email", codeAttempts: 0 })
  return NextResponse.json({ ok: true, step: "email" })
}
