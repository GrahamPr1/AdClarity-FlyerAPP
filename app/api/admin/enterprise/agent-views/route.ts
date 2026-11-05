import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/enterprise/portal/admin"
import { listAdminAgentViews } from "@/lib/enterprise/portal/store"

// GET /api/admin/enterprise/agent-views[?email=] -> admin views of agent accounts, newest first (admin only).
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase() || undefined
  return NextResponse.json({ views: await listAdminAgentViews({ agentEmail: email, limit: 200 }) }, { headers: { "Cache-Control": "no-store" } })
}
