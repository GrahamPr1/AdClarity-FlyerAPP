import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { setClientIsAdmin } from "@/lib/store"

// POST /api/admin/set-admin
// Grants or revokes /admin/* access for a real client account (see
// app/admin/layout.tsx). Gated to the ADMIN_SUB session ONLY — not to any
// isAdmin account — so admin access can't be granted by anyone other than
// the site owner's own password login. No UI yet: call with curl, or
// fetch() from the browser console while signed into /dashboard as admin
// (the session cookie goes along automatically).
//
//   fetch("/api/admin/set-admin", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ email: "partner@example.com", isAdmin: true }),
//   })
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (session?.sub !== ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { email?: string; isAdmin?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Missing required field: email" }, { status: 422 })
  }
  if (typeof body.isAdmin !== "boolean") {
    return NextResponse.json({ error: "Missing required field: isAdmin (boolean)" }, { status: 422 })
  }

  const client = await setClientIsAdmin(email, body.isAdmin)
  return NextResponse.json({ ok: true, client })
}
