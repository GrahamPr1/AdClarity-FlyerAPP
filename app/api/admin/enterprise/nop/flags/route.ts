import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { listAgentFlags } from "@/lib/enterprise/agents-store"

// GET /api/admin/enterprise/nop/flags -> blocked registration attempts, newest first
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ flags: await listAgentFlags() }, { headers: { "Cache-Control": "no-store" } })
}
