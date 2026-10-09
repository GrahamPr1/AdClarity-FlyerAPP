import { NextRequest, NextResponse } from "next/server"
import { recordNopAdminAction, requireNopConsole } from "@/lib/enterprise/org-admins"
import { rollbackTo } from "@/lib/enterprise/nop-render/content-store"

// POST /api/admin/enterprise/nop/content/rollback { version }
// Makes an earlier version (or "bundled-…") live again, unchanged.
export async function POST(request: NextRequest) {
  const who = await requireNopConsole(request)
  if ("response" in who) return who.response
  let version: string
  try {
    version = String(((await request.json()) as { version?: unknown }).version ?? "")
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const out = await rollbackTo(version, who.actor)
  if (!out.ok) return NextResponse.json(out, { status: 409 })
  await recordNopAdminAction(who.actor, "content_rollback", version)
  return NextResponse.json(out)
}
