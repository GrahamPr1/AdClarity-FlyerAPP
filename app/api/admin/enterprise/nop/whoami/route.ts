import { NextRequest, NextResponse } from "next/server"
import { requireNopConsole } from "@/lib/enterprise/org-admins"

// GET /api/admin/enterprise/nop/whoami -> { actor, isOwner } for the NOP console header.
export async function GET(request: NextRequest) {
  const who = await requireNopConsole(request)
  if ("response" in who) return who.response
  return NextResponse.json(who, { headers: { "Cache-Control": "no-store" } })
}
