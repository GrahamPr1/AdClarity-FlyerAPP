import { nextStatsMonth, statsMonth, statsMonthStart } from "@/lib/stats-month"
import { getAgentScans, listAgentLeads } from "./agent-data"
import { monthFunnel, type MonthFunnel } from "./lead-tracker"

export interface AgentResults extends MonthFunnel {
  month: string
  scans: number
}

/**
 * A month's results (Eastern; this month by default): flyer scans, and the
 * leads that came in, were contacted, got an appointment or enrolled in it
 * (lead-tracker.ts monthFunnel). Shared by Home and the monthly email so they
 * always agree. Callers must check canUse(ctx, "results") first.
 */
export async function agentResults(agentId: string, now = new Date(), month = statsMonth(now)): Promise<AgentResults> {
  const start = statsMonthStart(month), end = statsMonthStart(nextStatsMonth(month))
  const [scans, leads] = await Promise.all([getAgentScans(agentId, start), listAgentLeads(agentId)])
  return { month, scans: scans.thisMonth, ...monthFunnel(leads, start, end) }
}
