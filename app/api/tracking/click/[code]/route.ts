import { NextRequest, NextResponse } from "next/server"
import { incrementTrackingClick } from "@/lib/store"

// POST /api/tracking/click/[code] — fired by the redeem page's CTA button.
// Public/unauthenticated on purpose: whoever scanned the QR is anonymous —
// there's no session to check. Worst case a bad actor inflates a click
// count, which isn't sensitive data and isn't worth gating.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  await incrementTrackingClick(code)
  return NextResponse.json({ ok: true })
}
