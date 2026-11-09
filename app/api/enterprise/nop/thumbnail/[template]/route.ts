import { NextRequest, NextResponse } from "next/server"
import { requirePortalViewer } from "@/lib/enterprise/portal/view-as"
import { isNopTemplate, readThumbnail } from "@/lib/enterprise/nop-render/kit"
import { agentMaySeeTemplate, getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { isNopV2Template, readV2Preview } from "@/lib/enterprise/nop-render/kit-v2"

// GET /api/enterprise/nop/thumbnail/{NOP_P2_ES} -> the kit's own digital/
// PNG, as shipped: the blank master, used as the dashboard card image.
// Kit v2: Basic Benefits' own preview PNG, once agents are on kit v2.
// The kit lives outside public/, so it is served from here.
export async function GET(request: NextRequest, { params }: { params: Promise<{ template: string }> }) {
  // The agent, or an admin viewing their portal.
  const auth = await requirePortalViewer(request)
  if ("response" in auth) return auth.response
  const { template } = await params
  if (!(isNopTemplate(template) || isNopV2Template(template)) || !agentMaySeeTemplate(template, await getNopFlyerSettings(), isNopTemplate(template))) {
    return NextResponse.json({ error: "unknown_template" }, { status: 404 })
  }
  return new NextResponse(new Uint8Array(isNopV2Template(template) ? readV2Preview(template) : readThumbnail(template)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
  })
}
