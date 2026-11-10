import { NextRequest, NextResponse } from "next/server"
import { listNopAdminActions, requireNopAdmin } from "@/lib/enterprise/program-admins"

// GET /api/admin/enterprise/nop/admin-actions -> every NOP admin action, newest first (owner and program admins).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ actions: await listNopAdminActions(200) }, { headers: { "Cache-Control": "no-store" } })
}
