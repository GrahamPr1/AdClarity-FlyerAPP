import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { listAllUserEmails, getOrCreateClient, getGenerationLog } from "@/lib/store"
import type { AdminCostsOverview, AdminCostUserRow, GenerationAgentType, PlanId } from "@/lib/types"

const DAY_MS = 24 * 60 * 60 * 1000
const TREND_DAYS = 30
const TOP_COST_USER_COUNT = 20
const OUTLIER_MULTIPLIER = 3

// GET /api/admin/costs
// The real outlier/abuse-detection view — every number here is pulled from
// generation_log (phase 0), not estimated. One global 30-day log fetch
// covers today/this-week/this-month/the-trend-chart all at once (each is
// just a different filter over the same rows) rather than four separate
// Redis round-trips.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  const startOfToday = new Date(new Date(now).toDateString()).getTime()
  const monthStart = now - TREND_DAYS * DAY_MS

  const [users, log] = await Promise.all([
    listAllUserEmails().then((emails) => Promise.all(emails.map((email) => getOrCreateClient(email)))),
    getGenerationLog(monthStart),
  ])

  const totalCostTodayUsd = log.filter((e) => new Date(e.createdAt).getTime() >= startOfToday).reduce((sum, e) => sum + e.estimatedCostUsd, 0)
  const totalCostThisWeekUsd = log.filter((e) => new Date(e.createdAt).getTime() >= now - 7 * DAY_MS).reduce((sum, e) => sum + e.estimatedCostUsd, 0)
  const totalCostThisMonthUsd = log.reduce((sum, e) => sum + e.estimatedCostUsd, 0)

  // Daily cost buckets for the trend chart — same bucketing approach as
  // /api/admin/users' signupTrend, built from real timestamps.
  const dayBuckets = new Map<string, number>()
  for (let i = 0; i < TREND_DAYS; i++) {
    dayBuckets.set(new Date(monthStart + i * DAY_MS).toISOString().slice(0, 10), 0)
  }
  for (const e of log) {
    const date = new Date(e.createdAt).toISOString().slice(0, 10)
    if (dayBuckets.has(date)) dayBuckets.set(date, (dayBuckets.get(date) ?? 0) + e.estimatedCostUsd)
  }
  const costTrend = Array.from(dayBuckets.entries()).map(([date, cost]) => ({ date, cost }))

  const flyerEntries = log.filter((e) => e.agentType === "flyer")
  const averageCostPerFlyerGenerationUsd = flyerEntries.length > 0 ? flyerEntries.reduce((sum, e) => sum + e.estimatedCostUsd, 0) / flyerEntries.length : 0

  const costByAgentType = { intake: 0, brand: 0, flyer: 0 } as Record<GenerationAgentType, number>
  for (const e of log) costByAgentType[e.agentType] += e.estimatedCostUsd

  // Per-user cost this month — every user counts toward their plan's
  // average even at $0, so one active user on an otherwise-idle plan can
  // still legitimately be "more than 3x the average" (3x zero is zero).
  const costByEmail = new Map<string, number>()
  for (const e of log) costByEmail.set(e.email, (costByEmail.get(e.email) ?? 0) + e.estimatedCostUsd)

  const usersByPlan = { trial: [] as number[], basic: [] as number[], pro: [] as number[] } as Record<PlanId, number[]>
  for (const u of users) usersByPlan[u.plan].push(costByEmail.get(u.email) ?? 0)

  const planAverageCostUsd = { trial: 0, basic: 0, pro: 0 } as Record<PlanId, number>
  for (const plan of Object.keys(usersByPlan) as PlanId[]) {
    const costs = usersByPlan[plan]
    planAverageCostUsd[plan] = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0
  }

  const allUserCosts: AdminCostUserRow[] = users.map((u) => {
    const monthlyCostUsd = costByEmail.get(u.email) ?? 0
    const planAverage = planAverageCostUsd[u.plan]
    return {
      email: u.email,
      businessName: u.businessName,
      plan: u.plan,
      monthlyCostUsd,
      planAverageCostUsd: planAverage,
      isOutlier: monthlyCostUsd > OUTLIER_MULTIPLIER * planAverage,
    }
  })

  const topCostUsers = allUserCosts.sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd).slice(0, TOP_COST_USER_COUNT)

  const overview: AdminCostsOverview = {
    totalCostTodayUsd,
    totalCostThisWeekUsd,
    totalCostThisMonthUsd,
    costTrend,
    averageCostPerFlyerGenerationUsd,
    costByAgentType,
    planAverageCostUsd,
    topCostUsers,
  }

  return NextResponse.json(overview)
}
