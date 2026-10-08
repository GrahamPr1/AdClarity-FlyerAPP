import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { sendAgentVerificationCode } from "@/lib/email"
import { NOP_ORG_NAME, isValidEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { agentIdForRosterEmail, getAccountAgentId, getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { createFlow, hashCode, newCode, newFlowId, reserveDailySend } from "@/lib/enterprise/access-store"
import { accessRateLimit, fail, setFlowCookie } from "@/lib/enterprise/access-http"

// POST /api/enterprise/nop/access/signin { email }
//
// "Already registered? Sign in", step 1. Code sign-in is for AGENT accounts
// only. A code is sent when the email is
//   (a) the CURRENT roster email of a locked agent, or
//   (b) the account email of an account holding a locked Agent ID,
// and in both cases it goes to that agent's CURRENT roster email — so a
// roster email that changed on re-import stops working at once. Business
// accounts and unknown emails get the identical reply and no code. The
// email is sent after the response (waitUntil) so the two replies take
// the same time too.

/** The account and Agent ID a sign-in email resolves to, or null. */
async function resolveAgent(email: string): Promise<{ account: string; agentId: string } | null> {
  const byRoster = await agentIdForRosterEmail(email)
  if (byRoster) {
    const owner = await getAgentIdOwner(byRoster)
    if (owner && (await getAccountAgentId(owner)) === byRoster) return { account: owner, agentId: byRoster }
  }
  const held = await getAccountAgentId(email)
  if (held && (await getAgentIdOwner(held)) === email) return { account: email, agentId: held }
  return null
}

export async function POST(request: NextRequest) {
  const lang = await nopLangForRequest(request)
  let typed: string
  try {
    typed = normalizeEmail(String(((await request.json()) as { email?: unknown }).email ?? ""))
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!isValidEmail(typed)) return fail(lang, 422, "invalid_fields", "err.email_required", undefined, { field: "email" })

  const limited = await accessRateLimit(request, "signin", typed, lang)
  if (limited) return limited

  const flowId = newFlowId()
  const now = Date.now()
  const agent = await resolveAgent(typed)
  const roster = agent ? await getRosterRecord(agent.agentId) : null

  // A capped real agent gets the neutral reply too: a distinct "daily
  // limit" error would tell a stranger this email belongs to an agent.
  if (agent && roster && (await reserveDailySend(roster.rosterEmail, agent.agentId))) {
    const code = newCode()
    await createFlow(flowId, {
      kind: "signin", agentId: agent.agentId, account: agent.account, sendTo: roster.rosterEmail, codeHash: hashCode(flowId, code),
      attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now,
    })
    waitUntil(sendAgentVerificationCode(roster.rosterEmail, code, NOP_ORG_NAME, lang, "signin"))
  } else {
    // Same shape, nothing to send: every code will be "wrong".
    await createFlow(flowId, { kind: "signin", codeHash: null, attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now })
  }

  const res = NextResponse.json({ ok: true, step: "code" })
  setFlowCookie(res, flowId)
  return res
}
