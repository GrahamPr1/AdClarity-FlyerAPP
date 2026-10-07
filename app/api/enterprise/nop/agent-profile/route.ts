import { NextRequest, NextResponse } from "next/server"
import { getAgentProfile, saveAgentProfile } from "@/lib/store"
import { requireClientSession } from "@/lib/enterprise/agent-session"
import { validateDisplayFields } from "@/lib/enterprise/nop-roster"
import { canGenerate, getAccountAgentId, getRosterRecord } from "@/lib/enterprise/agents-store"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"

// GET   /api/enterprise/nop/agent-profile -> the agent's profile, with live roster status
// PATCH /api/enterprise/nop/agent-profile { displayName, displayPhone, displayEmail }
//
// PATCH writes the three display fields (and the name/phone/email mirrors of
// them) and nothing else. Any other key in the body is ignored.

async function loadAgent(email: string) {
  const agentId = await getAccountAgentId(email)
  if (!agentId) return null
  const profile = await getAgentProfile(email)
  if (!profile || profile.agentId !== agentId) return null
  return profile
}

export async function GET(request: NextRequest) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response
  const profile = await loadAgent(auth.email)
  if (!profile) return NextResponse.json({ error: "not_registered" }, { status: 404 })
  const roster = await getRosterRecord(profile.agentId!)
  return NextResponse.json(
    { profile, status: roster?.status ?? null, canGenerate: await canGenerate(profile) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(request: NextRequest) {
  const auth = await requireClientSession(request)
  if ("response" in auth) return auth.response
  const profile = await loadAgent(auth.email)
  if (!profile) return NextResponse.json({ error: "not_registered" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const display = validateDisplayFields(body, await nopLangForRequest(request, auth.email))
  if (!display.ok) return NextResponse.json({ error: "invalid_fields", fields: display.errors }, { status: 422 })

  const { savedAt: _savedAt, ...rest } = profile
  const saved = await saveAgentProfile(auth.email, {
    ...rest,
    ...display.values,
    name: display.values.displayName,
    phone: display.values.displayPhone,
    email: display.values.displayEmail,
  })
  return NextResponse.json({ profile: saved })
}
