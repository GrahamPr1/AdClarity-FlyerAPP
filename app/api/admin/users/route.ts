import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { listAllUserEmails, getOrCreateClient } from "@/lib/store"
import { PLAN_LIMITS, BUSINESS_CATEGORIES } from "@/lib/types"
import type { AdminUserRow, AdminUsersOverview, PlanId, BusinessCategory } from "@/lib/types"

const DAY_MS = 24 * 60 * 60 * 1000
const TREND_DAYS = 30

// GET /api/admin/users
// The real "who are our users" view — total count, signup trend, plan/
// category breakdowns, and the full sortable/searchable table (search and
// sort happen client-side against this same payload; the dataset is small
// enough at this app's current scale that a separate paginated/query-param
// endpoint isn't worth the complexity yet).
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const emails = await listAllUserEmails()
  const clients = await Promise.all(emails.map((email) => getOrCreateClient(email)))

  const users: AdminUserRow[] = clients.map((c) => ({
    email: c.email,
    businessName: c.businessName,
    plan: c.plan,
    businessCategory: c.businessCategory,
    createdAt: c.createdAt,
    flyersCreated: c.flyersCreated,
    flyersLimit: PLAN_LIMITS[c.plan],
    status: c.plan === "trial" ? "trial" : "active",
    isAdmin: c.isAdmin,
  }))

  const now = Date.now()
  const weekAgo = now - 7 * DAY_MS
  const monthAgo = now - 30 * DAY_MS
  const createdAtMs = users.map((u) => (u.createdAt ? new Date(u.createdAt).getTime() : null))

  const newSignupsThisWeek = createdAtMs.filter((t) => t !== null && t >= weekAgo).length
  const newSignupsThisMonth = createdAtMs.filter((t) => t !== null && t >= monthAgo).length

  // Daily buckets for the last 30 days, oldest first — the trend chart.
  // Built from real createdAt timestamps, not synthesized.
  const trendStart = now - (TREND_DAYS - 1) * DAY_MS
  const dayBuckets = new Map<string, number>()
  for (let i = 0; i < TREND_DAYS; i++) {
    const date = new Date(trendStart + i * DAY_MS).toISOString().slice(0, 10)
    dayBuckets.set(date, 0)
  }
  for (const t of createdAtMs) {
    if (t === null || t < trendStart) continue
    const date = new Date(t).toISOString().slice(0, 10)
    if (dayBuckets.has(date)) dayBuckets.set(date, (dayBuckets.get(date) ?? 0) + 1)
  }
  const signupTrend = Array.from(dayBuckets.entries()).map(([date, count]) => ({ date, count }))

  const byPlan = { trial: 0, basic: 0, pro: 0 } as Record<PlanId, number>
  for (const u of users) byPlan[u.plan]++

  const byCategory = Object.fromEntries(BUSINESS_CATEGORIES.map((c) => [c, 0])) as Record<BusinessCategory, number>
  for (const u of users) byCategory[u.businessCategory]++

  const overview: AdminUsersOverview = {
    totalUsers: users.length,
    newSignupsThisWeek,
    newSignupsThisMonth,
    signupTrend,
    byPlan,
    byCategory,
    users,
  }

  return NextResponse.json(overview)
}
