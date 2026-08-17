import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliverablesForEmail, getPendingBrandProfile, getSavedBrandProfile, saveBrandProfile } from "@/lib/store"

// POST /api/brand-profile/save-from-generation
// "Like this style? Save it as your brand" — accepts the one-time offer
// shown after a Quick Prompt generation (see components/quick-prompt-form.tsx).
// Promotes that generation's scratch-saved brand (see savePendingBrandProfile
// in lib/store.ts) into the client's REAL saved brand. Only if they don't
// already have one — accepting this is explicit, one-time, and never
// silently overwrites an existing saved brand the way the guided flow's
// auto-save does.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  let body: { flyerId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const flyerId = body.flyerId?.trim()
  if (!flyerId) {
    return NextResponse.json({ error: "Missing required field: flyerId" }, { status: 422 })
  }

  // Ownership check — the flyer must actually belong to this client.
  const deliverables = await getDeliverablesForEmail(email)
  if (!deliverables.flyers.some((f) => f.id === flyerId)) {
    return NextResponse.json({ error: "Flyer not found" }, { status: 404 })
  }

  const existing = await getSavedBrandProfile(email)
  if (existing) {
    return NextResponse.json({ error: "already_saved", message: "You already have a saved brand." }, { status: 409 })
  }

  const pending = await getPendingBrandProfile(flyerId)
  if (!pending) {
    return NextResponse.json({ error: "not_found", message: "This generation's brand data is no longer available — it may be too old." }, { status: 404 })
  }

  await saveBrandProfile(email, pending.brandProfile, pending.contact)
  return NextResponse.json({ ok: true })
}
