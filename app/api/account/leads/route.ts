import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { deleteLead, listLeadsForFlyer } from "@/lib/store"

// The signed-in client's own offer-page leads.
//
// GET    ?flyerId=<id>  one flyer's leads, newest first
// DELETE ?id=<leadId>   remove one lead (the record and both indexes)
//
// Any plan: these are the owner's own records, and a downgrade or pause must
// not hide or strand leads that already came in. Scoped by construction —
// every lead is read and deleted under client:<session email>:*, so another
// account's lead id or flyer id finds nothing.
export const dynamic = "force-dynamic"

async function clientSession(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.sub === ADMIN_SUB) return { error: NextResponse.json({ error: "Not available for the admin account" }, { status: 403 }) }
  return { email: session.sub }
}

export async function GET(request: NextRequest) {
  const s = await clientSession(request)
  if ("error" in s) return s.error
  const flyerId = request.nextUrl.searchParams.get("flyerId")
  if (!flyerId) return NextResponse.json({ error: "flyerId is required" }, { status: 400 })
  return NextResponse.json({ leads: await listLeadsForFlyer(s.email, flyerId) }, { headers: { "Cache-Control": "no-store" } })
}

export async function DELETE(request: NextRequest) {
  const s = await clientSession(request)
  if ("error" in s) return s.error
  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  if (!(await deleteLead(s.email, id))) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
