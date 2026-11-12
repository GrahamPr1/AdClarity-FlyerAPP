import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliveryNotice } from "@/lib/email-delivery"

// GET /api/account/email-status — whether a recent email to this account
// bounced, for the dashboard notice (lib/email-delivery.ts).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) return NextResponse.json({ notice: null }, { headers: { "Cache-Control": "no-store" } })
  return NextResponse.json({ notice: await getDeliveryNotice(session.sub) }, { headers: { "Cache-Control": "no-store" } })
}
