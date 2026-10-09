import { NextRequest, NextResponse } from "next/server"
import { businessAccountBlocks } from "@/lib/enterprise/account-conversion"
import { recordClientCreatedAtIfUnset, saveAgentProfile } from "@/lib/store"
import { validateDisplayFields } from "@/lib/enterprise/nop-roster"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { addAgentFlag, buildAgentProfile, getAccountAgentId, getRosterRecord, lockAgentId } from "@/lib/enterprise/agents-store"
import { deleteFlow } from "@/lib/enterprise/access-store"
import { clearFlowCookie, fail, readFlow, setSessionCookie } from "@/lib/enterprise/access-http"

// POST /api/enterprise/nop/access/confirm { displayName, displayPhone, displayEmail }
//
// "Get started", step 3: the agent confirmed "You are registering as …".
// The OneFlyer account is created HERE — its email is the roster email the
// code just proved, with no password. The Agent ID is claimed by the same
// atomic SET NX as before; a business account at that email is refused.

export async function POST(request: NextRequest) {
  const lang = await nopLangForRequest(request)
  const flow = await readFlow(request)
  if (!flow || flow.state.kind !== "register" || flow.state.step !== "verified") return fail(lang, 409, "no_registration", "err.expired")
  const { id, state } = flow

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const display = validateDisplayFields(body, lang)
  if (!display.ok) return NextResponse.json({ error: "invalid_fields", fields: display.errors }, { status: 422 })

  const end = (res: NextResponse) => {
    clearFlowCookie(res)
    return deleteFlow(id).then(() => res)
  }

  // Re-read: the roster may have been re-imported since the code was sent.
  const roster = await getRosterRecord(state.agentId!)
  if (!roster) return end(fail(lang, 404, "not_recognized", "err.not_recognized"))
  if (roster.status === "suspended" || roster.status === "terminated") return end(fail(lang, 403, "inactive", "err.inactive"))
  if (roster.rosterEmail !== state.sendTo) return end(fail(lang, 409, "no_registration", "err.expired"))

  const account = roster.rosterEmail
  const held = await getAccountAgentId(account)
  if (held) return end(fail(lang, 409, "account_registered", "err.account_registered", { agentId: held }))
  if (await businessAccountBlocks(account)) {
    await addAgentFlag({ type: "business_account_conflict", agentId: roster.agentId, account, attemptedEmail: account })
    return end(fail(lang, 409, "business_account", "err.business_account"))
  }

  const lock = await lockAgentId(roster.agentId, account)
  if (!lock.ok) {
    if (lock.reason === "id_taken") {
      await addAgentFlag({ type: "id_already_registered", agentId: roster.agentId, account, heldBy: lock.heldBy })
      return end(fail(lang, 409, "id_taken", "err.taken"))
    }
    return end(fail(lang, 409, "account_registered", "err.account_registered", { agentId: lock.agentId }))
  }

  await recordClientCreatedAtIfUnset(account)
  await saveAgentProfile(account, { ...buildAgentProfile(roster, display.values), preferredLanguage: lang })
  const res = NextResponse.json({ ok: true, agentId: roster.agentId, redirect: "/enterprise/nop/dashboard" })
  await setSessionCookie(res, account)
  return end(res)
}
