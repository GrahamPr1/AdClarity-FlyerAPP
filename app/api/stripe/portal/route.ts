import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { createPortalSession } from "@/lib/billing"
import { getClient } from "@/lib/store"

// POST /api/stripe/portal → { url }
//
// Opens the Stripe Customer Portal for the SIGNED-IN client's own Stripe
// customer: update card, switch plan, cancel, invoices. Whatever they change
// there comes back through the webhook — this route grants nothing itself.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const client = await getClient(session.sub)
  if (!client?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet — pick a plan on the pricing page first." }, { status: 404 })
  }

  try {
    const url = await createPortalSession(client.stripeCustomerId, `${request.nextUrl.origin}/profile`)
    return NextResponse.json({ url })
  } catch (err) {
    console.error("[stripe portal] failed:", err)
    return NextResponse.json({ error: "Couldn't open billing right now. Please try again." }, { status: 502 })
  }
}
