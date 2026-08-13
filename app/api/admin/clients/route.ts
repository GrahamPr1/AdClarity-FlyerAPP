import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { listClientsWithDeliverables } from "@/lib/store"

// GET /api/admin/clients
// The real "everyone's flyers" admin roster — every client's plan, usage,
// and flyers. Admin-only; a client session can never reach this, and this
// route is never used to render a client's own dashboard.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (session?.sub !== ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clients = await listClientsWithDeliverables()
  return NextResponse.json({ clients })
}
