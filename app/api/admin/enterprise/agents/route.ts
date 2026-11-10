import { NextRequest, NextResponse } from "next/server"
import { listAgentRows } from "@/lib/enterprise/portal/admin"
import { requireNopAdmin } from "@/lib/enterprise/program-admins"

// GET /api/admin/enterprise/agents -> every agent account (admin only).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ agents: await listAgentRows() }, { headers: { "Cache-Control": "no-store" } })
}
