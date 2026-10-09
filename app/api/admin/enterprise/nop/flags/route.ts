import { NextRequest, NextResponse } from "next/server"
import { requireNopConsole } from "@/lib/enterprise/org-admins"
import { listAgentFlags } from "@/lib/enterprise/agents-store"

// GET /api/admin/enterprise/nop/flags -> blocked registration attempts, newest first (owner or org admin)
export async function GET(request: NextRequest) {
  const who = await requireNopConsole(request)
  if ("response" in who) return who.response
  return NextResponse.json({ flags: await listAgentFlags() }, { headers: { "Cache-Control": "no-store" } })
}
