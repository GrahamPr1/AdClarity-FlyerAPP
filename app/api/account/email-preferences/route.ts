import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getEmailPreferences, LEAD_EMAIL_MODES, digestLive, monthlyLive, setEmailPreferences, type EmailPreferences, type LeadEmailMode } from "@/lib/email-preferences"

// GET/PUT /api/account/email-preferences — which public emails the signed-in
// account gets. Same shape as /api/account/theme: per person, server-side so
// it holds on every device, admin excluded (a shared credential, not a person).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ preferences: await getEmailPreferences(session.sub), digestAvailable: digestLive(), resultsAvailable: monthlyLive() }, { headers: { "Cache-Control": "no-store" } })
}

export async function PUT(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { leads?: string; results?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (body.leads !== undefined && !LEAD_EMAIL_MODES.includes(body.leads as LeadEmailMode)) {
    return NextResponse.json({ error: `leads must be one of: ${LEAD_EMAIL_MODES.join(", ")}` }, { status: 422 })
  }
  if (body.leads === "daily" && !digestLive()) {
    return NextResponse.json({ error: "The daily digest isn't available yet." }, { status: 422 })
  }
  if (body.results !== undefined && typeof body.results !== "boolean") {
    return NextResponse.json({ error: "results must be true or false" }, { status: 422 })
  }
  const patch: Partial<Omit<EmailPreferences, "updatedAt">> = {
    ...(body.leads ? { leads: body.leads as LeadEmailMode } : {}),
    ...(typeof body.results === "boolean" ? { results: body.results } : {}),
  }
  const preferences = await setEmailPreferences(session.sub, patch)
  return NextResponse.json({ ok: true, preferences })
}
