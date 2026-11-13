import { NextResponse, type NextRequest } from "next/server"
import { requireOrg } from "@/lib/ap/tenant"
import { isEmail, normalizeEmail } from "@/lib/ap/validate"
import { agentForEmail } from "@/lib/ap/store"
import { ipAllowed, startFlow } from "@/lib/ap/access"
import { sendApCode } from "@/lib/ap/email"
import { clientIp, jsonError, noStore, readJson, setFlowCookie } from "@/lib/ap/http"

// POST /api/ap/{org}/signin  {email}
//
// A code goes only to an ACTIVE agent of THIS org. Anyone else (unknown,
// pending, suspended, or an agent of another org) gets the identical reply
// with nothing sent.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const o = await requireOrg((await params).org)
  if ("response" in o) return o.response
  const { org } = o

  const email = normalizeEmail((await readJson(request))?.email)
  if (!isEmail(email)) return jsonError(422, "invalid", { field: "email" })
  if (!(await ipAllowed(clientIp(request)))) return jsonError(429, "rate_limited")

  const agent = await agentForEmail(org.id, email)
  const send = !!agent && agent.status === "active" && org.status !== "paused"
  const flow = await startFlow({ kind: "signin", orgId: org.id, email }, send)
  if ("error" in flow) return jsonError(429, flow.error)
  if (flow.code && agent) {
    const sent = await sendApCode(email, org.name, agent.lang, flow.code)
    if (!sent.sent) {
      console.error(`[ap] code email failed for org ${org.id}: ${sent.reason}`)
      return jsonError(502, "email_failed")
    }
  }
  const res = NextResponse.json({ ok: true, step: "code" }, { headers: noStore })
  setFlowCookie(res, flow.flowId)
  return res
}
