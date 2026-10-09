import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { sendOrgAdminInvite } from "@/lib/email"
import { NOP_ORG_NAME, isValidEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { addOrgAdmin, listNopAdminActions, listOrgAdmins, recordNopAdminAction, removeOrgAdmin } from "@/lib/enterprise/org-admins"

// GET    /api/admin/enterprise/nop/org-admins           -> org admins + the console audit log
// POST   /api/admin/enterprise/nop/org-admins { email } -> add one and email the invite
// DELETE /api/admin/enterprise/nop/org-admins { email } -> remove one (signed out at once)
//
// SITE OWNER ONLY. Unlike the rest of /api/admin/enterprise/nop/*, org
// admins cannot use this: they can't add or remove each other.

async function requireOwner(request: NextRequest) {
  const session = await getSessionIdentity(request)
  return isAdminSession(session?.sub)
}

const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 })

async function readEmail(request: NextRequest): Promise<string | null> {
  try {
    const email = normalizeEmail(String(((await request.json()) as { email?: unknown }).email ?? ""))
    return isValidEmail(email) ? email : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  if (!(await requireOwner(request))) return unauthorized()
  const [admins, actions] = await Promise.all([listOrgAdmins(), listNopAdminActions()])
  return NextResponse.json({ admins, actions }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  if (!(await requireOwner(request))) return unauthorized()
  const email = await readEmail(request)
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 })
  if (!(await addOrgAdmin(email, "owner"))) return NextResponse.json({ error: `${email} is already an org admin.` }, { status: 409 })
  const invited = await sendOrgAdminInvite(email, NOP_ORG_NAME, `${new URL(request.url).origin}/admin/enterprise/nop/sign-in`)
  await recordNopAdminAction("owner", "org_admin_added", `${email}${invited ? "" : " (invite email failed)"}`)
  return NextResponse.json({ ok: true, invited })
}

export async function DELETE(request: NextRequest) {
  if (!(await requireOwner(request))) return unauthorized()
  const email = await readEmail(request)
  if (!email) return NextResponse.json({ error: "Enter a valid email address." }, { status: 422 })
  if (!(await removeOrgAdmin(email))) return NextResponse.json({ error: `${email} is not an org admin.` }, { status: 404 })
  await recordNopAdminAction("owner", "org_admin_removed", email)
  return NextResponse.json({ ok: true })
}
