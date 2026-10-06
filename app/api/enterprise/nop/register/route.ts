import { NextRequest, NextResponse } from "next/server"
import { requireClientSession } from "@/lib/enterprise/agent-session"
import { getAccountAgentId, getRegistration, getRosterRecord } from "@/lib/enterprise/agents-store"

// GET /api/enterprise/nop/register -> where this account is in registration,
// so a reload resumes the right step rather than starting over.
export async function GET(request: NextRequest) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response

  const registeredAgentId = await getAccountAgentId(auth.email)
  if (registeredAgentId) return NextResponse.json({ registeredAgentId })

  const state = await getRegistration(auth.email)
  if (!state) return NextResponse.json({ step: "id" })
  if (state.step !== "verified") return NextResponse.json({ step: state.step, agentId: state.agentId })

  const roster = await getRosterRecord(state.agentId)
  if (!roster) return NextResponse.json({ step: "id" })
  return NextResponse.json({
    step: "verified",
    agentId: roster.agentId,
    agentName: roster.agentName,
    defaults: { displayName: roster.agentName, displayPhone: roster.rosterPhone, displayEmail: roster.rosterEmail },
  })
}
