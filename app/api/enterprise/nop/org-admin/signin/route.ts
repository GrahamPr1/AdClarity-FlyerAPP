import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { sendOrgAdminCode } from "@/lib/email"
import { NOP_ORG_NAME, isValidEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { createFlow, hashCode, newCode, newFlowId, reserveDailySend } from "@/lib/enterprise/access-store"
import { getOrgAdmin } from "@/lib/enterprise/org-admins"
import { orgAdminFail, orgAdminRateLimit, setOrgAdminFlowCookie } from "@/lib/enterprise/org-admin-http"

// POST /api/enterprise/nop/org-admin/signin { email }
//
// NOP admin console sign-in, step 1. A code goes only to a current org
// admin's own email; anyone else gets the identical reply and no code. The
// email is sent after the response so both replies take the same time.

export async function POST(request: NextRequest) {
  let email: string
  try {
    email = normalizeEmail(String(((await request.json()) as { email?: unknown }).email ?? ""))
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!isValidEmail(email)) return orgAdminFail(422, "invalid_fields", "Enter your email address.", { field: "email" })

  const limited = await orgAdminRateLimit(request, "signin", email)
  if (limited) return limited

  const flowId = newFlowId()
  const now = Date.now()
  if ((await getOrgAdmin(email)) && (await reserveDailySend(email, null))) {
    const code = newCode()
    await createFlow(flowId, {
      kind: "org-admin", account: email, sendTo: email, codeHash: hashCode(flowId, code),
      attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now,
    })
    waitUntil(sendOrgAdminCode(email, code, NOP_ORG_NAME))
  } else {
    // Same shape, nothing to send: every code will be "wrong".
    await createFlow(flowId, { kind: "org-admin", codeHash: null, attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now })
  }

  const res = NextResponse.json({ ok: true, step: "code" })
  setOrgAdminFlowCookie(res, flowId)
  return res
}
