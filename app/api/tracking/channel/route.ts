import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getClient, getDeliverables, getDeliverablesForEmail } from "@/lib/store"
import { createChannelTrackingCode } from "@/lib/agent-pipeline/qrTracking"
import { channelTrackingEnabled } from "@/lib/agent-pipeline/plan-features"

const MAX_LABEL_LENGTH = 40
const MAX_CHANNELS_PER_FLYER = 12

// POST /api/tracking/channel — mint an additional tracked link for a flyer,
// labelled with the channel it will be shared through.
//
// Post-generation only, by design: generation is untouched, and a client
// decides how they are distributing a flyer after they have seen it.
//
// Basic/Pro, not paused, checked here on the flyer OWNER's live record, for
// the admin's mirrored view too: hiding the button is not what enforces it.
// Only creating a code is gated. /r/<code> never looks at this, so codes that
// already exist keep working after a downgrade or pause.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { flyerId?: string; label?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const flyerId = body.flyerId?.trim()
  const label = body.label?.trim()
  if (!flyerId || !label) {
    return NextResponse.json({ error: "Missing required fields: flyerId, label" }, { status: 422 })
  }
  if (label.length > MAX_LABEL_LENGTH) {
    return NextResponse.json({ error: `Label must be ${MAX_LABEL_LENGTH} characters or fewer` }, { status: 422 })
  }

  // Same admin allowance as the read route — the admin dashboard shows the
  // mirrored client view, and minting from it must work there too.
  const deliverables = session.sub === ADMIN_SUB ? await getDeliverables() : await getDeliverablesForEmail(session.sub)
  const flyer = deliverables.flyers.find((f) => f.id === flyerId)
  if (!flyer) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const ownerEmail = session.sub === ADMIN_SUB ? deliverables.email : session.sub
  if (!channelTrackingEnabled(ownerEmail ? await getClient(ownerEmail) : null)) {
    return NextResponse.json(
      { error: "upgrade_required", message: "Tracking by channel is part of Basic and Pro. If your account is paused, resume it first." },
      { status: 403 },
    )
  }

  if (!flyer.trackingCode) {
    return NextResponse.json(
      { error: "no_qr", message: "This flyer was generated without a QR code, so there's nothing to track." },
      { status: 422 },
    )
  }

  const { listFlyerChannelCodes } = await import("@/lib/store")
  if ((await listFlyerChannelCodes(flyerId)).length >= MAX_CHANNELS_PER_FLYER) {
    return NextResponse.json(
      { error: "limit", message: `You can track up to ${MAX_CHANNELS_PER_FLYER} channels per flyer.` },
      { status: 422 },
    )
  }

  const minted = await createChannelTrackingCode(flyer.trackingCode, label)
  if (!minted) {
    return NextResponse.json({ error: "This flyer's tracking record is no longer available." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, code: minted.code, label, url: minted.redeemUrl, qrDataUrl: minted.qrDataUrl })
}
