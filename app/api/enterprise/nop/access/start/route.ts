import { NextRequest, NextResponse } from "next/server"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { sendAgentVerificationCode } from "@/lib/email"
import { AGENT_ID_RE, NOP_ORG_NAME, formatUsPhone, isValidEmail, maskEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { isPendingSelfSignup } from "@/lib/enterprise/agent-signup"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import type { NopLang } from "@/lib/enterprise/nop-i18n"
import { addAgentFlag, getAccountAgentId, getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { createFlow, hashCode, newCode, newFlowId, reserveDailySend } from "@/lib/enterprise/access-store"
import { businessAccountBlocks } from "@/lib/enterprise/account-conversion"
import { accessRateLimit, fail, setFlowCookie } from "@/lib/enterprise/access-http"

// POST /api/enterprise/nop/access/start { agentId, email, name, phone, lang }
//
// "First time? Get started", step 1. No account and no session yet.
//
// Imported roster agent (the ID is on an imported roster AND the typed email
// is its roster email): the original flow, unchanged — code to the roster
// email, then the confirmation screen, then an active account.
//
// Everyone else is a self sign-up (lib/enterprise/agent-signup.ts): the
// typed details are checked, a code goes to the typed email, and verify
// finishes it. Whether the Agent ID is free, held, or on the roster is NOT
// looked at here and never changes the reply: verify answers "we'll review
// your sign-up" either way, so nobody can test which IDs exist.

const SIGNED_OUT = "(signed out)"

export async function POST(request: NextRequest) {
  // Registration and sign-in are writes: never while an admin views a portal.
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const lang = await nopLangForRequest(request)
  let body: { agentId?: unknown; email?: unknown; name?: unknown; phone?: unknown; lang?: unknown }
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
  if (!roster || roster.source === "self" || typed !== roster.rosterEmail) return selfSignup(lang, agentId, typed, body)
  if (roster.status === "suspended" || roster.status === "terminated") return fail(lang, 403, "inactive", "err.inactive")

  const owner = await getAgentIdOwner(agentId)
  if (owner) {
    await addAgentFlag({ type: "id_already_registered", agentId, account: SIGNED_OUT, heldBy: owner, attemptedEmail: typed })
    return fail(lang, 409, "already_registered", "err.already_registered")
  }

  // The agent's account will be this email. An existing BUSINESS account
  // there must not get the ID: it would lose SMB generation. An admin can
  // convert an unpaid one (lib/enterprise/account-conversion.ts); then this
  // passes and registration proceeds normally.
  const existingId = await getAccountAgentId(roster.rosterEmail)
  if (existingId) return fail(lang, 409, "account_registered", "err.account_registered", { agentId: existingId })
  if (await businessAccountBlocks(roster.rosterEmail)) {
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

/** A self sign-up: check what was typed, then send a code to the typed email. Nothing about the Agent ID is looked up. */
async function selfSignup(lang: NopLang, agentId: string, email: string, body: { name?: unknown; phone?: unknown; lang?: unknown }) {
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ")
  const phone = formatUsPhone(String(body.phone ?? ""))
  const signupLang: NopLang = body.lang === "es" ? "es" : body.lang === "en" ? "en" : lang
  const fields: Record<string, string> = {}
  if (!name) fields.name = tNop(lang, "val.full_name_required")
  else if (name.length > 80) fields.name = tNop(lang, "val.name_long")
  if (!phone) fields.phone = tNop(lang, "val.phone")
  if (Object.keys(fields).length) return NextResponse.json({ error: "invalid_fields", fields }, { status: 422 })

  // About the typed email only (the person's own): an email that already
  // holds an active agent account should sign in instead; a business account
  // can't take an Agent ID. A pending sign-up's email goes on, and verify
  // treats it as a duplicate.
  const held = await getAccountAgentId(email)
  if (held && !isPendingSelfSignup(await getRosterRecord(held))) return fail(lang, 409, "account_registered", "err.account_registered", { agentId: held })
  if (!held && (await businessAccountBlocks(email))) {
    await addAgentFlag({ type: "business_account_conflict", agentId, account: email, attemptedEmail: email })
    return fail(lang, 409, "business_account", "err.business_account")
  }

  if (!(await reserveDailySend(email, agentId))) return fail(lang, 429, "daily_limit", "err.daily_limit")
  const flowId = newFlowId()
  const code = newCode()
  if (!(await sendAgentVerificationCode(email, code, NOP_ORG_NAME, lang, "register"))) return fail(lang, 502, "send_failed", "err.send_failed")
  const now = Date.now()
  await createFlow(flowId, {
    kind: "signup", agentId, sendTo: email, codeHash: hashCode(flowId, code),
    attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now,
    signup: { name, phone: phone!, lang: signupLang },
  })
  const res = NextResponse.json({ ok: true, step: "code", sentTo: maskEmail(email) })
  setFlowCookie(res, flowId)
  return res
}
