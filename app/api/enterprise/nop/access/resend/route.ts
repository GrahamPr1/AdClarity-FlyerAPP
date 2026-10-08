import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { sendAgentVerificationCode } from "@/lib/email"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { getRosterRecord } from "@/lib/enterprise/agents-store"
import { MAX_RESENDS, RESEND_COOLDOWN_SECONDS, deleteFlow, hashCode, newCode, reserveDailySend, updateFlow } from "@/lib/enterprise/access-store"
import { clearFlowCookie, fail, readFlow } from "@/lib/enterprise/access-http"

// POST /api/enterprise/nop/access/resend
//
// A fresh code for the flow in progress: 60 s apart, at most 5 per flow,
// within the daily caps, and always to the CURRENT roster email — if the
// roster email changed since the flow began, the flow ends. A neutral
// sign-in flow (no agent behind the email) answers exactly the same way
// and sends nothing.

export async function POST(request: NextRequest) {
  const lang = await nopLangForRequest(request)
  const flow = await readFlow(request)
  if (!flow || flow.state.step !== "code") return fail(lang, 409, "no_registration", "err.expired")
  const { id, state } = flow

  const waitS = Math.ceil((state.lastSentAt + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000)
  if (waitS > 0) return fail(lang, 429, "resend_wait", "err.resend_wait", undefined, { retryAfter: waitS })
  if (state.resends >= MAX_RESENDS) {
    await deleteFlow(id)
    const res = fail(lang, 429, "resend_limit", "err.resend_limit")
    clearFlowCookie(res)
    return res
  }

  const now = Date.now()
  const ok = NextResponse.json({ ok: true, cooldown: RESEND_COOLDOWN_SECONDS })
  if (!state.agentId || !state.sendTo) {
    await updateFlow(id, { ...state, resends: state.resends + 1, lastSentAt: now })
    return ok
  }

  const roster = await getRosterRecord(state.agentId)
  if (!roster || roster.rosterEmail !== state.sendTo || roster.status === "terminated" || (state.kind === "register" && roster.status === "suspended")) {
    await deleteFlow(id)
    const res = fail(lang, 409, "no_registration", "err.expired")
    clearFlowCookie(res)
    return res
  }
  if (!(await reserveDailySend(roster.rosterEmail, state.agentId))) {
    if (state.kind === "signin") {
      // Neutral, as at the first send.
      await updateFlow(id, { ...state, resends: state.resends + 1, lastSentAt: now })
      return ok
    }
    return fail(lang, 429, "daily_limit", "err.daily_limit")
  }
  const code = newCode()
  await updateFlow(id, { ...state, codeHash: hashCode(id, code), resends: state.resends + 1, lastSentAt: now })
  if (state.kind === "signin") {
    waitUntil(sendAgentVerificationCode(roster.rosterEmail, code, NOP_ORG_NAME, lang, "signin"))
    return ok
  }
  if (!(await sendAgentVerificationCode(roster.rosterEmail, code, NOP_ORG_NAME, lang, "register"))) return fail(lang, 502, "send_failed", "err.send_failed")
  return ok
}
