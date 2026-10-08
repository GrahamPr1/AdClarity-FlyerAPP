import { NextRequest, NextResponse } from "next/server"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { getAccountAgentId, getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { MAX_CODE_ATTEMPTS, codeMatches, deleteFlow, updateFlow } from "@/lib/enterprise/access-store"
import { accessRateLimit, clearFlowCookie, fail, readFlow, setSessionCookie } from "@/lib/enterprise/access-http"

// POST /api/enterprise/nop/access/verify { code }
//
// Both flows. Register: a correct code moves on to the confirmation screen
// (name and ID ON FILE). Sign-in: a correct code signs the agent in and
// sends them to their dashboard. Codes are single-use (the hash is dropped
// on success) and compared in constant time; 5 wrong tries end the flow.

export async function POST(request: NextRequest) {
  const lang = await nopLangForRequest(request)
  const flow = await readFlow(request)
  if (!flow) return fail(lang, 409, "no_registration", "err.expired")
  const limited = await accessRateLimit(request, "verify", flow.id, lang)
  if (limited) return limited

  let code: string
  try {
    code = String(((await request.json()) as { code?: unknown }).code ?? "").replace(/\D/g, "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const { id, state } = flow

  // Register, already verified (e.g. a reload): show the confirmation again.
  if (state.kind === "register" && state.step === "verified") return confirmPayload(state.agentId!, lang)

  if (!codeMatches(id, code, state.codeHash)) {
    const attempts = state.attempts + 1
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await deleteFlow(id)
      const res = fail(lang, 429, "too_many_attempts", "err.too_many")
      clearFlowCookie(res)
      return res
    }
    await updateFlow(id, { ...state, attempts })
    return fail(lang, 400, "wrong_code", "err.wrong_code")
  }

  if (state.kind === "register") {
    await updateFlow(id, { ...state, codeHash: null, step: "verified" })
    return confirmPayload(state.agentId!, lang)
  }

  // Sign-in: re-check the agent still holds the ID and the code went to the
  // CURRENT roster email, then sign in.
  await deleteFlow(id)
  const roster = state.agentId ? await getRosterRecord(state.agentId) : null
  const stillHeld = state.account && state.agentId && (await getAgentIdOwner(state.agentId)) === state.account
    && (await getAccountAgentId(state.account)) === state.agentId
  if (!roster || !stillHeld || roster.rosterEmail !== state.sendTo) {
    const res = fail(lang, 409, "no_registration", "err.expired")
    clearFlowCookie(res)
    return res
  }
  const res = NextResponse.json({ ok: true, redirect: "/enterprise/nop/dashboard" })
  await setSessionCookie(res, state.account!)
  clearFlowCookie(res)
  return res
}

async function confirmPayload(agentId: string, lang: Parameters<typeof fail>[0]) {
  const roster = await getRosterRecord(agentId)
  if (!roster) return fail(lang, 404, "not_recognized", "err.not_recognized")
  return NextResponse.json({
    ok: true,
    step: "confirm",
    agentId: roster.agentId,
    agentName: roster.agentName,
    defaults: { displayName: roster.agentName, displayPhone: roster.rosterPhone, displayEmail: roster.rosterEmail },
  })
}
