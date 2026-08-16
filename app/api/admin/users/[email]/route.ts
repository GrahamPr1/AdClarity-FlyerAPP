import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { getClient, getGenerationLogForEmail } from "@/lib/store"
import { PLAN_LIMITS } from "@/lib/types"
import type { AdminUserDetail } from "@/lib/types"

// GET /api/admin/users/[email]
// The "clicking a user" drill-down — their real generation history (every
// Intake/Brand/Flyer API call, see generation_log) and estimated AI cost
// to date, summed from those same real rows, not a separate estimate.
export async function GET(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { email: rawEmail } = await params
  const email = decodeURIComponent(rawEmail).trim().toLowerCase()

  const client = await getClient(email)
  if (!client) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const generationLog = await getGenerationLogForEmail(email)
  const totalEstimatedCostUsd = generationLog.reduce((sum, e) => sum + e.estimatedCostUsd, 0)

  const detail: AdminUserDetail = {
    email: client.email,
    businessName: client.businessName,
    plan: client.plan,
    businessCategory: client.businessCategory,
    createdAt: client.createdAt,
    flyersCreated: client.flyersCreated,
    flyersLimit: PLAN_LIMITS[client.plan],
    status: client.plan === "trial" ? "trial" : "active",
    isAdmin: client.isAdmin,
    generationLog,
    totalEstimatedCostUsd,
  }

  return NextResponse.json(detail)
}
