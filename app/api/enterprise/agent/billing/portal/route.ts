import { NextRequest, NextResponse } from "next/server"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { createAgentPortal } from "@/lib/enterprise/portal/agent-billing"

// POST /api/enterprise/agent/billing/portal -> { url }
// The agent's own Stripe Customer Portal (card, invoices, cancel at period
// end). Changes come back through the agent webhook; this grants nothing.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, null)
  if ("response" in r) return r.response
  try {
    const url = await createAgentPortal(r.ctx.email, `${request.nextUrl.origin}/agent`)
    if (!url) return NextResponse.json({ error: "no_billing" }, { status: 404 })
    return NextResponse.json({ url })
  } catch (err) {
    console.error("[agent portal] failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "portal_failed" }, { status: 502 })
  }
}
