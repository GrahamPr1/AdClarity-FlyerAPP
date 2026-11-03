import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getClient, getDeliverablesForEmail, getTrackingRecord, hasOfferPageUndo, resetOfferPageToFlyer, saveOfferPageEdit, undoOfferPageEdit } from "@/lib/store"
import { leadCaptureEnabled } from "@/lib/agent-pipeline/plan-features"
import { redeemUrlFor } from "@/lib/agent-pipeline/qrTracking"
import { OwnerOfferSchema, isOfferExpired, ownerContentOf } from "@/lib/offer-page-content"

/**
 * The owner's editor for one flyer's offer page (/r/<code>).
 *
 * GET  — the editable content, plus whether this account may edit it.
 * PUT  — save an edit to every code of the flyer.
 * POST — "?action=undo" (one level) or "?action=reset" (match the flyer again).
 *
 * Saving and undo require an active paid plan (Basic/Pro, not paused),
 * checked here against the live client record: the editor hides its controls
 * otherwise, but that is not what enforces it. Reset is allowed on any plan:
 * it only puts back what the flyer says, and without it a downgraded owner's
 * edited page could never follow the flyer again. Scoped to the caller's own
 * flyers, so another account's flyer id is simply not found.
 *
 * Content only: the QR code, its tracking code and redeemUrl never change.
 */
export const dynamic = "force-dynamic"

async function loadOwnOfferPage(req: NextRequest, flyerId: string) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.sub === ADMIN_SUB) {
    return { error: NextResponse.json({ error: "Not available for the admin account" }, { status: 403 }) }
  }
  const deliverables = await getDeliverablesForEmail(session.sub)
  const flyer = deliverables.flyers.find((f) => f.id === flyerId)
  const code = flyer?.trackingCode
  const record = code ? await getTrackingRecord(code) : null
  // 404 for "not yours", "no QR" and "no page" alike: probing ids reveals nothing.
  if (!flyer || !code || !record || record.flyerId !== flyerId) {
    return { error: NextResponse.json({ error: "Offer page not found" }, { status: 404 }) }
  }
  return { email: session.sub, flyerId, code, record }
}

const notOnPlan = () =>
  NextResponse.json(
    { error: "upgrade_required", message: "Editing your offer page is part of Basic and Pro. If your account is paused, resume it first." },
    { status: 403 },
  )

export async function GET(req: NextRequest, ctx: { params: Promise<{ flyerId: string }> }) {
  const loaded = await loadOwnOfferPage(req, (await ctx.params).flyerId)
  if ("error" in loaded) return loaded.error
  const { email, flyerId, code, record } = loaded
  return NextResponse.json(
    {
      content: ownerContentOf(record),
      businessName: record.businessName,
      website: record.website,
      disclaimer: record.disclaimer,
      code,
      qrUrl: redeemUrlFor(code, record),
      edited: !!record.offerPageEdited,
      expired: isOfferExpired(record.expiresAt),
      canEdit: leadCaptureEnabled(await getClient(email)),
      canUndo: await hasOfferPageUndo(flyerId),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ flyerId: string }> }) {
  const loaded = await loadOwnOfferPage(req, (await ctx.params).flyerId)
  if ("error" in loaded) return loaded.error
  const { email, flyerId, code } = loaded
  if (!leadCaptureEnabled(await getClient(email))) return notOnPlan()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid", message: "Check the form." }, { status: 400 })
  }
  const parsed = OwnerOfferSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", message: parsed.error.issues[0]?.message ?? "Check the form.", field: parsed.error.issues[0]?.path[0] }, { status: 422 })
  }
  if (!(await saveOfferPageEdit(flyerId, code, parsed.data))) {
    return NextResponse.json({ error: "Offer page not found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ flyerId: string }> }) {
  const loaded = await loadOwnOfferPage(req, (await ctx.params).flyerId)
  if ("error" in loaded) return loaded.error
  const { email, flyerId, code } = loaded
  const action = new URL(req.url).searchParams.get("action")
  if (action !== "reset" && !leadCaptureEnabled(await getClient(email))) return notOnPlan()

  if (action === "undo") {
    if (!(await undoOfferPageEdit(flyerId, code))) return NextResponse.json({ error: "nothing_to_undo", message: "There's nothing to undo." }, { status: 409 })
    return NextResponse.json({ ok: true, undone: true })
  }
  if (action === "reset") {
    if (!(await resetOfferPageToFlyer(flyerId, code))) return NextResponse.json({ error: "Offer page not found" }, { status: 404 })
    return NextResponse.json({ ok: true, reset: true })
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
