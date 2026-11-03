import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { deleteLead, listLeadsForClient } from "@/lib/store"

// Admin only: one account's offer-page leads, and deleting a single lead —
// for when someone who filled in a form asks us to remove what they sent
// (see the Privacy Policy).
//
// GET    ?email=<account>
// DELETE ?email=<account>&id=<leadId>
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 })
  return NextResponse.json({ leads: await listLeadsForClient(email) }, { headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  const id = request.nextUrl.searchParams.get("id")
  if (!email || !id) return NextResponse.json({ error: "email and id are required" }, { status: 400 })
  if (!(await deleteLead(email, id))) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  console.warn(`[admin] Deleted lead ${id} from ${email}`)
  return NextResponse.json({ ok: true })
}
