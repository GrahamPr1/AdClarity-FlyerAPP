import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { sendAgentVerificationCode } from "@/lib/email"
import { NOP_ORG_NAME, isValidEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { FLOW_TTL_SECONDS, createFlow, hashCode, newCode, newFlowId, reserveDailySend } from "@/lib/enterprise/access-store"
import { PROGRAM_ADMIN_FLOW_COOKIE, getProgramAdmin, programAdminCookieOptions } from "@/lib/enterprise/program-admins"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

// POST /api/program-admin/signin { email } -> code screen.
// A code is sent only to a listed program admin; anyone else gets the same
// reply and nothing is sent (sent after the response, so both take the same time).

export async function POST(request: NextRequest) {
  let email: string
  try {
    email = normalizeEmail(String(((await request.json()) as { email?: unknown }).email ?? ""))
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!isValidEmail(email)) return NextResponse.json({ error: "invalid", message: "Enter your email address." }, { status: 422 })
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`program-admin:signin:ip:${clientIp(request.headers)}`, 30, 15 * 60),
    checkRateLimit(`program-admin:signin:sub:${email}`, 10, 15 * 60),
  ])
  if (!byIp.allowed || !byEmail.allowed) return NextResponse.json({ error: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 })

  const flowId = newFlowId()
  const now = Date.now()
  const admin = await getProgramAdmin(email)
  if (admin && (await reserveDailySend(email, "program-admin"))) {
    const code = newCode()
    await createFlow(flowId, { kind: "program-admin", account: email, sendTo: email, codeHash: hashCode(flowId, code), attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now })
    waitUntil(sendAgentVerificationCode(email, code, NOP_ORG_NAME, "en", "signin"))
  } else {
    await createFlow(flowId, { kind: "program-admin", codeHash: null, attempts: 0, resends: 0, lastSentAt: now, step: "code", createdAt: now })
  }
  const res = NextResponse.json({ ok: true, step: "code" })
  res.cookies.set(PROGRAM_ADMIN_FLOW_COOKIE, flowId, programAdminCookieOptions(FLOW_TTL_SECONDS))
  return res
}
