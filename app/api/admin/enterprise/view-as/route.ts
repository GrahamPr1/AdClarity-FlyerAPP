import { NextRequest, NextResponse } from "next/server"
import { listAgentRows, requireAdmin } from "@/lib/enterprise/portal/admin"
import { logAdminAgentView } from "@/lib/enterprise/portal/store"
import { VIEW_AS_COOKIE, VIEW_AS_MAX_AGE_SECONDS, createViewAsToken } from "@/lib/enterprise/portal/view-as"

// POST   /api/admin/enterprise/view-as { email } -> open that agent's portal, read-only
// DELETE /api/admin/enterprise/view-as           -> leave it
// Admin only. Sets a signed cookie naming the agent; never the agent's session.
const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" }

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  let email: string
  try {
    email = String(((await request.json()) as { email?: unknown }).email ?? "").trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const row = (await listAgentRows()).find((r) => r.email === email)
  if (!row) return NextResponse.json({ error: "Not an agent account" }, { status: 404 })
  await logAdminAgentView({ admin: auth.admin, agentEmail: email, agentId: row.agentId, kind: "view-as" })
  const res = NextResponse.json({ ok: true, redirect: "/agent" })
  res.cookies.set(VIEW_AS_COOKIE, await createViewAsToken(auth.admin, email), { ...cookieOptions, maxAge: VIEW_AS_MAX_AGE_SECONDS })
  return res
}

// Leaving needs no admin check: clearing the cookie only ever removes access.
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(VIEW_AS_COOKIE, "", { ...cookieOptions, maxAge: 0 })
  return res
}
