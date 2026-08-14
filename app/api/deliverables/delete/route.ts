import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { deleteFlyerDeliverable } from "@/lib/store"

// POST /api/deliverables/delete
// Removes one flyer from a client's dashboard. A client session always
// deletes their OWN flyer (their session email, never a client-supplied
// one). The admin session has no "own" deliverables, so it must specify
// which client's flyer to delete. Does not affect flyersCreated — see
// deleteFlyerDeliverable's comment in lib/store.ts.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { flyerId?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const flyerId = body.flyerId?.trim()
  if (!flyerId) {
    return NextResponse.json({ error: "Missing required field: flyerId" }, { status: 422 })
  }

  let email: string
  if (session.sub === ADMIN_SUB) {
    const adminEmail = body.email?.trim().toLowerCase()
    if (!adminEmail) {
      return NextResponse.json({ error: "Missing required field: email (required for admin deletes)" }, { status: 422 })
    }
    email = adminEmail
  } else {
    email = session.sub
  }

  const deleted = await deleteFlyerDeliverable(email, flyerId)
  if (!deleted) {
    return NextResponse.json({ error: "Flyer not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
