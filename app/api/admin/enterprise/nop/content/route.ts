import { NextRequest, NextResponse } from "next/server"
import { requireNopConsole, recordNopAdminAction } from "@/lib/enterprise/org-admins"
import { versionStamp } from "@/lib/enterprise/nop-render/kit"
import {
  MAX_CONTENT_BYTES, bundledContent, contentHistory, createDraft, getLiveContent,
  listContentEvents, listContentVersions, validateContentUpload,
} from "@/lib/enterprise/nop-render/content-store"

// GET  /api/admin/enterprise/nop/content          -> live content, version history, publish/rollback events
// POST /api/admin/enterprise/nop/content { json } -> validate an upload; when valid, keep it as a draft
//                                                   to preview (all 8) and then publish
//
// The site owner or a NOP org admin.

export async function GET(request: NextRequest) {
  const who = await requireNopConsole(request)
  if ("response" in who) return who.response
  const [live, versions, events] = await Promise.all([getLiveContent(), listContentVersions(), listContentEvents()])
  const bundled = bundledContent()
  const summary = (version: string, c: typeof live.content) => ({ version, effectiveDate: c.program.effective_date, stamp: versionStamp(c, "NOP_P1_EN"), prices: c.prices })
  return NextResponse.json(
    {
      live: { ...summary(live.version, live.content), content: live.content },
      bundled: summary(bundled.version, bundled.content),
      versions: versions.map((v) => ({ ...summary(v.id, v.content), uploadedBy: v.uploadedBy, uploadedAt: v.uploadedAt, note: v.note })),
      events,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: NextRequest) {
  const who = await requireNopConsole(request)
  if ("response" in who) return who.response
  let json: unknown
  try {
    json = ((await request.json()) as { json?: unknown }).json
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (typeof json !== "string" || json.trim() === "") return NextResponse.json({ error: "Choose or paste a content.json first." }, { status: 422 })
  if (json.length > MAX_CONTENT_BYTES) return NextResponse.json({ error: "That file is too large for a content.json." }, { status: 413 })

  const live = await getLiveContent()
  const check = validateContentUpload(json, live, await contentHistory())
  if (!check.ok || !check.content) return NextResponse.json({ error: "invalid", errors: check.errors, changes: check.changes }, { status: 422 })
  const draft = await createDraft(check.content, who.actor, live, check.changes)
  await recordNopAdminAction(who.actor, "content_uploaded", `${check.changes.join("; ")} (draft against ${live.version})`)
  return NextResponse.json({ ok: true, draftId: draft.id, changes: draft.changes, baseVersion: live.version })
}
