import { statsMonth, statsMonthStart } from "@/lib/stats-month"
import { countAgentLeads, getAgentScans } from "./agent-data"

/** This month (Eastern) for the agent's Home: scans and leads. Callers must check canUse(ctx, "results") first. */
export async function agentResults(agentId: string, now = new Date()): Promise<{ month: string; scans: number; leads: number }> {
  const month = statsMonth(now)
  const [scans, leads] = await Promise.all([getAgentScans(agentId, now), countAgentLeads(agentId, statsMonthStart(month))])
  return { month, scans: scans.thisMonth, leads }
}
