import { NextRequest, NextResponse } from "next/server"
import { requirePortalViewer } from "@/lib/enterprise/portal/view-as"
import { isNopTemplate, readThumbnail } from "@/lib/enterprise/nop-render/kit"

// GET /api/enterprise/nop/thumbnail/{NOP_P2_ES} -> the kit's own digital/
// PNG, as shipped: the blank master, used as the dashboard card image.
// The kit lives outside public/, so it is served from here.
export async function GET(request: NextRequest, { params }: { params: Promise<{ template: string }> }) {
  // The agent, or an admin viewing their portal.
  const auth = await requirePortalViewer(request)
  if ("response" in auth) return auth.response
  const { template } = await params
  if (!isNopTemplate(template)) return NextResponse.json({ error: "unknown_template" }, { status: 404 })
  return new NextResponse(new Uint8Array(readThumbnail(template)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
  })
}
