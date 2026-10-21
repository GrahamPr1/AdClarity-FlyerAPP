import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getOrCreateClient, setClientPaused } from "@/lib/store"
import { setSubscriptionCollectionPaused } from "@/lib/billing"

// POST /api/account/pause  { paused: boolean }
//
// Pauses or resumes the SIGNED-IN client's own account. Scoped to the session
// email only — there is deliberately no way to pause someone else's account
// from here, admin included, because the admin has no client record of its own.
//
// Pausing writes one timestamp. It deletes nothing: brand profile, generated
// flyers and QR tracking history all survive, which is the entire reason this
// exists as an alternative to cancelling.
//
// For a paying subscriber this also pauses BILLING, via Stripe's
// pause_collection (see setSubscriptionCollectionPaused). Stripe goes first:
// if it fails, the account is left as it was rather than showing "paused"
// while the card keeps being charged. A free-trial account has no
// subscription, so the pause is account state only, as before.
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
  const client = await getOrCreateClient(email)
  let billingPaused = false
  try {
    billingPaused = await setSubscriptionCollectionPaused(client, body.paused)
  } catch (err) {
    console.error("[account pause] Stripe pause_collection failed:", err)
    return NextResponse.json(
      { error: `Couldn't ${body.paused ? "pause" : "resume"} billing right now, so nothing was changed. Please try again.` },
      { status: 502 },
    )
  }
  const pausedAt = await setClientPaused(email, body.paused)

  return NextResponse.json({ ok: true, paused: body.paused, pausedAt, billingPaused })
}
