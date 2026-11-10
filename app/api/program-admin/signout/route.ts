import { NextRequest, NextResponse } from "next/server"
import { PROGRAM_ADMIN_COOKIE, endProgramAdminSessions, logNopAdminAction, programAdminCookieOptions, programAdminFrom } from "@/lib/enterprise/program-admins"
import { VIEW_AS_COOKIE } from "@/lib/enterprise/portal/view-as"

// POST /api/program-admin/signout: ends every session this program admin has (a copied cookie too).
export async function POST(request: NextRequest) {
  const admin = await programAdminFrom(request)
  if (admin) {
    await endProgramAdminSessions(admin.email)
    await logNopAdminAction({ actor: admin.email, actorName: admin.name, role: "program", action: "sign_out", detail: "" })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PROGRAM_ADMIN_COOKIE, "", programAdminCookieOptions(0))
  res.cookies.set(VIEW_AS_COOKIE, "", { path: "/", maxAge: 0 })
  return res
}
