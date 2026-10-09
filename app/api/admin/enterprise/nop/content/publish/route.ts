import { NextRequest, NextResponse } from "next/server"
import { recordNopAdminAction, requireNopConsole } from "@/lib/enterprise/org-admins"
import { publishDraft } from "@/lib/enterprise/nop-render/content-store"

// POST /api/admin/enterprise/nop/content/publish { draftId, note }
// Makes a fully previewed upload the live content: agents get it on their next render.
export async function POST(request: NextRequest) {
  const who = await requireNopConsole(request)
  if ("response" in who) return who.response
  let body: { draftId?: unknown; note?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const note = String(body.note ?? "").trim().slice(0, 500)
  const out = await publishDraft(String(body.draftId ?? ""), who.actor, note)
  if (!out.ok) return NextResponse.json(out, { status: 409 })
  await recordNopAdminAction(who.actor, "content_published", `${out.version}${note ? ` — ${note}` : ""}`)
  return NextResponse.json(out)
}
