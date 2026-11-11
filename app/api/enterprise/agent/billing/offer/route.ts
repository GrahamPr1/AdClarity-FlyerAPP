import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { agentTrialDays, canBuyPro } from "@/lib/enterprise/portal/agent-billing"

// GET /api/enterprise/agent/billing/offer -> { canBuy, trialDays }
// What the Upgrade button offers this agent: Pro at $40/month, or, when the
// free trial is on and they've never had one, "Try Pro free for X days".
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, null)
  if ("response" in r) return r.response
  const canBuy = canBuyPro(r.ctx)
  return NextResponse.json({ canBuy, trialDays: canBuy ? await agentTrialDays(r.ctx.email, r.ctx.agent.agentId) : null }, { headers: { "Cache-Control": "no-store" } })
}
