import { NextResponse, type NextRequest } from "next/server"
import { requireOrg } from "@/lib/ap/tenant"
import { AP_FLOW_COOKIE, verifyFlow } from "@/lib/ap/access"
import { agentForEmail, createAgent } from "@/lib/ap/store"
import { setApSessionCookie } from "@/lib/ap/session"
import { clearFlowCookie, jsonError, noStore, readJson } from "@/lib/ap/http"

// POST /api/ap/{org}/verify  {code}
//
// Finishes the flow started on THIS org's page (a flow from another org is
// refused). Sign-up: creates the agent (active or pending per the org's
// rules). Either way, a session is set only for an ACTIVE agent of this org.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const o = await requireOrg((await params).org)
  if ("response" in o) return o.response
  const { org } = o

  const code = String((await readJson(request))?.code ?? "").trim()
  const result = await verifyFlow(request.cookies.get(AP_FLOW_COOKIE)?.value, org.id, code)
  if (!result.ok) return jsonError(result.error === "wrong_code" ? 400 : 410, result.error)

  const { state } = result
  let agent = state.kind === "signin" ? await agentForEmail(org.id, state.email) : null
  if (state.kind === "signup" && state.signup) {
    const { recruiterAgentId, ...details } = state.signup
    const created = await createAgent(org, details, recruiterAgentId)
    // Lost a race for the ID or email: the same neutral reply as a held one.
    if (!created.ok) {
      const res = NextResponse.json({ ok: true, state: "review" }, { headers: noStore })
      clearFlowCookie(res)
      return res
    }
    agent = created.agent
  }

  if (!agent || agent.orgId !== org.id || agent.status !== "active") {
    const res = NextResponse.json({ ok: true, state: agent?.status === "pending" ? "pending" : "review" }, { headers: noStore })
    clearFlowCookie(res)
    return res
  }
  const res = NextResponse.json({ ok: true, state: "signed_in", next: `/ap/${org.slug}` }, { headers: noStore })
  clearFlowCookie(res)
  setApSessionCookie(res, agent.agentId, org.id)
  return res
}
