import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { loadBillingData } from "@/lib/billing-admin-data"
import { freePaidPlanAudit, toMemberRow } from "@/lib/billing-admin"

// GET /api/admin/billing/audit — paid plans with no Stripe subscription and no
// logged admin override. A list to look at; it changes no account.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { clients, waitlistEmails } = await loadBillingData()
  return NextResponse.json({ accounts: freePaidPlanAudit(clients).map((c) => toMemberRow(c, waitlistEmails)) })
}
