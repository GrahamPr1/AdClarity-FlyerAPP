import { NextRequest, NextResponse } from "next/server"
import { sendOrgAdminCode } from "@/lib/email"
import { NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { MAX_RESENDS, RESEND_COOLDOWN_SECONDS, deleteFlow, hashCode, newCode, reserveDailySend, updateFlow } from "@/lib/enterprise/access-store"
import { getOrgAdmin } from "@/lib/enterprise/org-admins"
import { clearOrgAdminFlowCookie, orgAdminFail, readOrgAdminFlow } from "@/lib/enterprise/org-admin-http"
import { waitUntil } from "@vercel/functions"

// POST /api/enterprise/nop/org-admin/resend
//
// A fresh code for the sign-in in progress: 60 s apart, at most 5 per flow,
// within the daily cap. A neutral flow answers the same and sends nothing.

export async function POST(request: NextRequest) {
  const flow = await readOrgAdminFlow(request)
  if (!flow || flow.state.step !== "code") return orgAdminFail(409, "expired", "That code has expired. Please start again.")
  const { id, state } = flow
  const waitS = Math.ceil((state.lastSentAt + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000)
  if (waitS > 0) return orgAdminFail(429, "resend_wait", `Please wait ${waitS} seconds before asking for another code.`, { retryAfter: waitS })
  if (state.resends >= MAX_RESENDS) {
    await deleteFlow(id)
    const res = orgAdminFail(429, "resend_limit", "Too many codes requested. Please start again later.")
    clearOrgAdminFlowCookie(res)
    return res
  }
  const now = Date.now()
  const ok = NextResponse.json({ ok: true, cooldown: RESEND_COOLDOWN_SECONDS })
  if (!state.account || !(await getOrgAdmin(state.account)) || !(await reserveDailySend(state.account, null))) {
    // Neutral, removed in the meantime, or capped: same reply, nothing sent, old code stops working.
    await updateFlow(id, { ...state, codeHash: null, resends: state.resends + 1, lastSentAt: now })
    return ok
  }
  const code = newCode()
  await updateFlow(id, { ...state, codeHash: hashCode(id, code), attempts: 0, resends: state.resends + 1, lastSentAt: now })
  waitUntil(sendOrgAdminCode(state.account, code, NOP_ORG_NAME))
  return ok
}
