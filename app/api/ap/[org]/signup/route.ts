import { NextResponse, type NextRequest } from "next/server"
import { requireOrg } from "@/lib/ap/tenant"
import { checkSignup } from "@/lib/ap/validate"
import { agentForEmail, externalIdTaken, recruiterFor } from "@/lib/ap/store"
import { ipAllowed, startFlow } from "@/lib/ap/access"
import { sendApCode } from "@/lib/ap/email"
import { clientIp, jsonError, noStore, readJson, setFlowCookie } from "@/lib/ap/http"

// POST /api/ap/{org}/signup  {externalId, name, phone, email, lang, ref?}
//
// Starts a sign-up for THIS org only. The code goes to the email; nothing is
// created until /verify proves the inbox. An Agent ID or email already held
// in this org gets the same "code sent" reply with no code sent, so nobody
// can learn which IDs or emails exist. ?ref= counts only for an active agent
// of the same org (recruiterFor).
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const o = await requireOrg((await params).org)
  if ("response" in o) return o.response
  const { org } = o
  if (org.status === "paused") return jsonError(403, "org_paused")

  const body = await readJson(request)
  const input = checkSignup(body, org.languages)
  if (!input.ok) return jsonError(422, "invalid", { field: input.field, message: input.error })
  if (!(await ipAllowed(clientIp(request)))) return jsonError(429, "rate_limited")

  const { ref, ...details } = input.value
  const [held, emailAgent, recruiter] = await Promise.all([externalIdTaken(org.id, details.externalId), agentForEmail(org.id, details.email), recruiterFor(org.id, ref)])
  const send = !held && !emailAgent

  const flow = await startFlow({ kind: "signup", orgId: org.id, email: details.email, signup: { ...details, recruiterAgentId: recruiter?.agentId ?? null } }, send)
  if ("error" in flow) return jsonError(429, flow.error)
  if (flow.code) {
    const sent = await sendApCode(details.email, org.name, details.lang, flow.code)
    if (!sent.sent) {
      console.error(`[ap] code email failed for org ${org.id}: ${sent.reason}`)
      return jsonError(502, "email_failed")
    }
  }
  const res = NextResponse.json({ ok: true, step: "code" }, { headers: noStore })
  setFlowCookie(res, flow.flowId)
  return res
}
