import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getOrCreateClient, setClientPaused } from "@/lib/store"

// POST /api/account/pause  { paused: boolean }
//
// Pauses or resumes the SIGNED-IN client's own account. Scoped to the session
// email only — there is deliberately no way to pause someone else's account
// from here, admin included, because the admin has no client record of its own.
//
// Pausing writes one timestamp. It deletes nothing: brand profile, generated
// flyers and QR tracking history all survive, which is the entire reason this
// exists as an alternative to cancelling. Once Stripe is connected this is
// also where the subscription gets paused — see docs/local-development.md and
// the note on ClientRecord.pausedAt.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { paused?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ error: "Missing required boolean field: paused" }, { status: 422 })
  }

  const email = session.sub
  await getOrCreateClient(email)
  const pausedAt = await setClientPaused(email, body.paused)

  return NextResponse.json({ ok: true, paused: body.paused, pausedAt })
}
