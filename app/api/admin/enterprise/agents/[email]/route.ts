import { NextRequest, NextResponse } from "next/server"
import { getAgentDetail, requireAdmin } from "@/lib/enterprise/portal/admin"
import { logAdminAgentView } from "@/lib/enterprise/portal/store"

// GET /api/admin/enterprise/agents/{email} -> one agent's account (admin only).
// Every open is logged: admin, agent, time.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const email = decodeURIComponent((await params).email).trim().toLowerCase()
  const detail = await getAgentDetail(email)
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await logAdminAgentView({ admin: auth.admin, agentEmail: email, agentId: detail.agentId, kind: "detail" })
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } })
}
