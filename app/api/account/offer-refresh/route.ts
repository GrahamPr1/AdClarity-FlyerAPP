import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getOfferRefresh } from "@/lib/offer-refresh"

// GET /api/account/offer-refresh — offers due a refresh, for the dashboard
// banner (lib/offer-refresh.ts). Empty for trial, paused, enterprise and NOP.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ items: [], canNewPromotion: false }, { headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json(await getOfferRefresh(session.sub), { headers: { "Cache-Control": "no-store" } })
}
