import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { addProgramAdmin, listProgramAdmins, removeProgramAdmin } from "@/lib/enterprise/program-admins"
import { isValidEmail, normalizeEmail } from "@/lib/enterprise/nop-roster"

// GET    /api/admin/program-admins                     -> the program admins
// POST   /api/admin/program-admins { email, name }     -> add one
// DELETE /api/admin/program-admins { email }           -> remove one (their access ends at once)
// The OWNER only (a OneFlyer admin session): program admins can't manage admins.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ admins: await listProgramAdmins() }, { headers: { "Cache-Control": "no-store" } })
}

async function body(request: NextRequest): Promise<{ email: string; name: string } | null> {
  try {
    const b = (await request.json()) as { email?: unknown; name?: unknown }
    return { email: normalizeEmail(String(b.email ?? "")), name: String(b.name ?? "").trim().slice(0, 80) }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const b = await body(request)
  if (!b || !isValidEmail(b.email) || !b.name) return NextResponse.json({ error: "invalid", message: "Enter a name and an email address." }, { status: 422 })
  await addProgramAdmin(b.email, b.name, auth.admin)
  return NextResponse.json({ admins: await listProgramAdmins() })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const b = await body(request)
  if (!b || !b.email) return NextResponse.json({ error: "invalid" }, { status: 422 })
  await removeProgramAdmin(b.email, auth.admin)
  return NextResponse.json({ admins: await listProgramAdmins() })
}
