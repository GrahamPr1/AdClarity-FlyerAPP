import { NextRequest, NextResponse } from "next/server"
import { listAgentRows, requireAdmin } from "@/lib/enterprise/portal/admin"
import { isAgentTier } from "@/lib/enterprise/portal/features"
import { setAgentTier } from "@/lib/enterprise/portal/store"

// POST /api/admin/enterprise/agents/{email}/tier { tier: "basic" | "pro" | "leader" }
// Admin only. The only way an agent's tier changes (no agent billing yet).
export async function POST(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const auth = await requireAdmin(request)
  if ("response" in auth) return auth.response
  const email = decodeURIComponent((await params).email).trim().toLowerCase()
  let tier: unknown
  try {
    tier = ((await request.json()) as { tier?: unknown }).tier
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!isAgentTier(tier)) return NextResponse.json({ error: "tier must be basic, pro or leader" }, { status: 422 })
  if (!(await listAgentRows()).some((r) => r.email === email)) return NextResponse.json({ error: "Not an agent account" }, { status: 404 })
  await setAgentTier(email, tier)
  console.log(`[agent-portal] ${auth.admin} set ${email} to ${tier}`)
  return NextResponse.json({ ok: true, tier })
}
