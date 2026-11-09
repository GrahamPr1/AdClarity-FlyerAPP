import { NextRequest, NextResponse } from "next/server"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { createAgentCheckout } from "@/lib/enterprise/portal/agent-billing"

// POST /api/enterprise/agent/billing/checkout -> { url } (Stripe Checkout for agent Pro, $40/month + tax)
//
// Only the agent themselves (never an admin viewing as them), only an ACTIVE
// roster agent (pending, suspended or rejected can't buy), and only from
// Basic. Pro is granted by the webhook once Stripe confirms payment, never here.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, null)
  if ("response" in r) return r.response
  const { ctx } = r
  if (!ctx.active) return NextResponse.json({ error: "not_active" }, { status: 403 })
  if (ctx.tier !== "basic") return NextResponse.json({ error: "already_pro" }, { status: 409 })
  try {
    const out = await createAgentCheckout(ctx.email, request.nextUrl.origin)
    if (out.kind === "unavailable") return NextResponse.json({ error: "unavailable" }, { status: 503 })
    if (out.kind === "already_subscribed") return NextResponse.json({ error: "already_subscribed" }, { status: 409 })
    return NextResponse.json({ url: out.url })
  } catch (err) {
    console.error("[agent checkout] failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 })
  }
}
