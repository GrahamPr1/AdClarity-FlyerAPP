import { getAgentProfile } from "@/lib/store"
import type { AgentProfile, AgentRosterStatus } from "@/lib/types"
import { getAccountAgentId, getRosterRecord } from "@/lib/enterprise/agents-store"
import { isGenerationStatus } from "@/lib/enterprise/nop-roster"
import type { NopStringKey } from "@/lib/enterprise/nop-i18n"

export interface NopAgentContext {
  /** The LOCKED Agent ID (agent-account:{email}, set by SET NX at registration). */
  agentId: string
  profile: AgentProfile
  /** Live from the roster; null when the roster has no record. */
  status: AgentRosterStatus | null
  /** canGenerate, read now — never cached on the profile. */
  active: boolean
}

/** The registered agent behind an account, or null if the account holds no Agent ID. */
export async function loadNopAgent(account: string): Promise<NopAgentContext | null> {
  const agentId = await getAccountAgentId(account)
  if (!agentId) return null
  const profile = await getAgentProfile(account)
  if (!profile || profile.agentId !== agentId) return null
  const roster = await getRosterRecord(agentId)
  return { agentId, profile, status: roster?.status ?? null, active: isGenerationStatus(roster) }
}

/** The bilingual status message for an agent who can't preview or download. */
export function nopStatusMessageKey(status: AgentRosterStatus | null): NopStringKey {
  if (status === "pending") return "dash.status_pending"
  if (status === "suspended") return "dash.status_suspended"
  if (status === "terminated") return "dash.status_terminated"
  return "dash.status_missing"
}
