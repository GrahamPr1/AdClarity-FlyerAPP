import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { markWaitlistNotified } from "@/lib/store"

// POST /api/admin/waitlist/notify  { ids: string[] }
//
// Records that these people have been told billing is live. It does NOT send
// anything — sending is a deliberate act, and this exists so that once the
// emails go out there's a record of who already got one, rather than someone
// being told twice.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { ids?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string") : []
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide at least one entry id" }, { status: 422 })
  }

  const { updated } = await markWaitlistNotified(ids)
  return NextResponse.json({ ok: true, updated })
}
