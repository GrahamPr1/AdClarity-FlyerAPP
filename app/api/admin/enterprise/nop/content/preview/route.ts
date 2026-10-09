import { NextRequest, NextResponse } from "next/server"
import { requireNopConsole } from "@/lib/enterprise/org-admins"
import { isNopTemplate } from "@/lib/enterprise/nop-render/kit"
import { NopRenderError, renderNopFlyer } from "@/lib/enterprise/nop-render/render"
import { getDraft, markDraftPreviewed, sha256 } from "@/lib/enterprise/nop-render/content-store"
import { RENDER_CHECK_AGENT } from "@/lib/enterprise/nop-render/test-agent"

// GET /api/admin/enterprise/nop/content/preview?draft=…&template=NOP_P1_EN
//
// One template rendered through the real agent pipeline (fonts, fitting, QR
// gate) with an UNPUBLISHED upload and the fixed render-check agent, as a
// PNG. A successful preview is recorded on the draft; publishing needs all 8.
// Not written to the generation log: no agent produced it.

export const maxDuration = 60
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const who = await requireNopConsole(request)
  if ("response" in who) return who.response
  const url = new URL(request.url)
  const template = url.searchParams.get("template") ?? ""
  if (!isNopTemplate(template)) return NextResponse.json({ error: "unknown template" }, { status: 422 })
  const draft = await getDraft(url.searchParams.get("draft") ?? "")
  if (!draft) return NextResponse.json({ error: "This upload has expired. Upload it again." }, { status: 404 })
  try {
    const r = await renderNopFlyer(template, RENDER_CHECK_AGENT, "preview", { version: `draft-${draft.id}`, content: draft.content, sha: sha256(JSON.stringify(draft.content)) })
    await markDraftPreviewed(draft.id, template)
    return new NextResponse(new Uint8Array(r.body), { headers: { "Content-Type": r.contentType, "Cache-Control": "no-store" } })
  } catch (err) {
    const code = err instanceof NopRenderError ? err.code : "render_failed"
    return NextResponse.json({ error: code, message: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
