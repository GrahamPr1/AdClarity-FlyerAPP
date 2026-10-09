import { NextRequest, NextResponse } from "next/server"
import { clearOrgAdminSession, getOrgAdminSession, recordNopAdminAction, revokeOrgAdminSessions } from "@/lib/enterprise/org-admins"

// POST /api/enterprise/nop/org-admin/signout — ends the org admin's console
// sessions: this cookie, and (server-side) any copy of it or other session.
export async function POST(request: NextRequest) {
  const email = await getOrgAdminSession(request)
  if (email) {
    await revokeOrgAdminSessions(email)
    await recordNopAdminAction(email, "sign_out", "")
  }
  const res = NextResponse.json({ ok: true, redirect: "/admin/enterprise/nop/sign-in" })
  clearOrgAdminSession(res)
  return res
}
