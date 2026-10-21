import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { loadBillingData } from "@/lib/billing-admin-data"
import { computeOverview, needsAttention } from "@/lib/billing-admin"

// GET /api/admin/billing — the overview cards and the needs-attention list.
// Read-only: nothing here changes a plan or touches Stripe.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const data = await loadBillingData()
  return NextResponse.json({
    overview: computeOverview({ ...data, now: Date.now() }),
    needsAttention: needsAttention(data.clients, data.disputes),
  })
}
