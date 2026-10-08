import { NextRequest, NextResponse } from "next/server"
import { sendAgentVerificationCode } from "@/lib/email"
import { AGENT_ID_RE, NOP_ORG_NAME, isValidEmail, maskEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { addAgentFlag, getAccountAgentId, getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { createFlow, hashCode, newCode, newFlowId, oneFlyerAccountExists, reserveDailySend } from "@/lib/enterprise/access-store"
import { accessRateLimit, fail, setFlowCookie } from "@/lib/enterprise/access-http"

// POST /api/enterprise/nop/access/start { agentId, email }
//
// "First time? Get started", step 1 of 3. No account and no session yet.
// Every check the signed-in flow had runs here before a code is sent:
// roster lookup, status, the typed email against the roster, the ID lock,
// and — new — the roster email must not already be a business account.
// The code goes to the roster email ON FILE (here equal to what was typed).

const SIGNED_OUT = "(signed out)"

export async function POST(request: NextRequest) {
  const lang = await nopLangForRequest(request)
  let body: { agentId?: unknown; email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const agentId = String(body.agentId ?? "").trim()
  const typed = normalizeEmail(String(body.email ?? ""))
  if (!agentId) return fail(lang, 422, "invalid_fields", "err.agent_id_required", undefined, { field: "agentId" })
  if (!AGENT_ID_RE.test(agentId)) return fail(lang, 422, "invalid_format", "err.id_format", undefined, { field: "agentId" })
  if (!isValidEmail(typed)) return fail(lang, 422, "invalid_fields", "err.email_required", undefined, { field: "email" })

  const limited = await accessRateLimit(request, "start", agentId, lang)
  if (limited) return limited

  const roster = await getRosterRecord(agentId)
  if (!roster) return fail(lang, 404, "not_recognized", "err.not_recognized")
  if (roster.status === "suspended" || roster.status === "terminated") return fail(lang, 403, "inactive", "err.inactive")

  if (typed !== roster.rosterEmail) {
    await addAgentFlag({ type: "email_mismatch", agentId, account: SIGNED_OUT, attemptedEmail: typed })
    return fail(lang, 403, "email_mismatch", "err.email_mismatch")
  }

  const owner = await getAgentIdOwner(agentId)
  if (owner) {
    await addAgentFlag({ type: "id_already_registered", agentId, account: SIGNED_OUT, heldBy: owner, attemptedEmail: typed })
    return fail(lang, 409, "already_registered", "err.already_registered")
  }

  // The agent's account will be this email. An existing BUSINESS account
  // there must not get the ID: it would lose SMB generation.
  const existingId = await getAccountAgentId(roster.rosterEmail)
  if (existingId) return fail(lang, 409, "account_registered", "err.account_registered", { agentId: existingId })
  if (await oneFlyerAccountExists(roster.rosterEmail)) {
    await addAgentFlag({ type: "business_account_conflict", agentId, account: roster.rosterEmail, attemptedEmail: roster.rosterEmail })
    return fail(lang, 409, "business_account", "err.business_account")
  }

  if (!(await reserveDailySend(roster.rosterEmail, agentId))) return fail(lang, 429, "daily_limit", "err.daily_limit")

  const flowId = newFlowId()
  const code = newCode()
  if (!(await sendAgentVerificationCode(roster.rosterEmail, code, NOP_ORG_NAME, lang, "register"))) {
    return fail(lang, 502, "send_failed", "err.send_failed")
  }
  const now = Date.now()
  await createFlow(flowId, {
    kind: "register", agentId, sendTo: roster.rosterEmail, codeHash: hashCode(flowId, code),
    attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now,
  })
  const res = NextResponse.json({ ok: true, step: "code", sentTo: maskEmail(roster.rosterEmail) })
  setFlowCookie(res, flowId)
  return res
}
