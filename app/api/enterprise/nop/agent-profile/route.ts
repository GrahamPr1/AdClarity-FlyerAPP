import { NextRequest, NextResponse } from "next/server"
import { getAgentProfile, saveAgentProfile } from "@/lib/store"
import { requireClientSession } from "@/lib/enterprise/agent-session"
import { rejectWhileViewingAs, requirePortalViewer } from "@/lib/enterprise/portal/view-as"
import { qrDestinationFor, validateDisplayFields } from "@/lib/enterprise/nop-roster"
import { getEnrollDomain } from "@/lib/enterprise/nop-enroll-domain"
import { canGenerate, getAccountAgentId, getRosterRecord } from "@/lib/enterprise/agents-store"
import { requestNameChange } from "@/lib/enterprise/agent-signup"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"

// GET   /api/enterprise/nop/agent-profile -> the agent's profile, with live roster status
// PATCH /api/enterprise/nop/agent-profile { displayName, displayPhone, displayEmail }
//
// PATCH writes the display phone and email (and their mirrors) and nothing
// else; a different display name becomes a request for admin approval
// (agent-signup.ts requestNameChange). Any other key in the body is ignored.

async function loadAgent(email: string) {
  const agentId = await getAccountAgentId(email)
  if (!agentId) return null
  const profile = await getAgentProfile(email)
  if (!profile || profile.agentId !== agentId) return null
  return profile
}

export async function GET(request: NextRequest) {
  // The agent, or an admin viewing their portal (read-only).
  const auth = await requirePortalViewer(request)
  if ("response" in auth) return auth.response
  const profile = await loadAgent(auth.email)
  if (!profile) return NextResponse.json({ error: "not_registered" }, { status: 404 })
  const roster = await getRosterRecord(profile.agentId!)
  // The enrollment link shown is the live one (the domain setting), not the snapshot saved at registration.
  const live = { ...profile, qrDestination: qrDestinationFor(profile.agentId!, await getEnrollDomain()) }
  return NextResponse.json(
    { profile: live, status: roster?.status ?? null, canGenerate: await canGenerate(profile) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
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

  // Phone and email save now. The name prints on flyers, so a new one waits
  // for admin approval (pendingName) and the approved name stays meanwhile;
  // typing the current name back cancels a waiting request.
  const { savedAt: _savedAt, ...rest } = profile
  const currentName = profile.displayName ?? profile.name
  const newName = display.values.displayName
  await saveAgentProfile(auth.email, {
    ...rest,
    displayPhone: display.values.displayPhone,
    displayEmail: display.values.displayEmail,
    phone: display.values.displayPhone,
    email: display.values.displayEmail,
    ...(newName === currentName ? { pendingName: null } : {}),
  })
  if (newName !== currentName && newName !== profile.pendingName?.name) await requestNameChange(auth.email, newName)
  const saved = (await getAgentProfile(auth.email))!
  return NextResponse.json({ profile: { ...saved, qrDestination: qrDestinationFor(saved.agentId!, await getEnrollDomain()) } })
}
