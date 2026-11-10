import { Redis } from "@upstash/redis"
import { del as delBlob } from "@vercel/blob"
import { deleteRosterRecord, getAgentIdOwner, getRosterRecord } from "./agents-store"
import { deleteAgentLeads, deleteAgentScans, listAgentLeadIds } from "./portal/agent-data"
import { deleteAgentEvents, listAgentEvents } from "./portal/events"
import { deleteAgentPageSettings, getAgentPageSettings } from "./portal/agent-page"
import { deleteAgentRecruiting } from "./portal/recruiting"
import { deleteTeamPicks } from "./portal/team"
import { endAgentProOnRemoval, getAgentBilling, type RemovalBillingOutcome } from "./portal/agent-billing"
import { RETENTION_DUE_KEY } from "./portal/retention"

// Deleting an agent account: by an admin (owner or program admin) on request,
// or by the 12-month retention job for an agent removed from the program
// (retention-job.ts). Both use deleteAgentAccount.
//
// Deleted: the account and profile, tier and billing record, page settings
// and photo, events, leads and RSVPs, scan counts, the recruit link and
// recruits list, the Leader's sent flyers, and the roster record and ID lock
// (so the Agent ID can be issued again).
//
// Kept: the flyer download record (nop-render-log, a record the program
// requires), the agent's QR code mapping (it belongs to the Agent ID; with
// no roster record it forwards to the program's page), and the admin logs of
// who did what. The deletion log keeps the Agent ID, who, when, why and the
// counts, never the person's details.
//
// A paid Pro subscription is cancelled first, with the unused part refunded,
// as on Remove. If Stripe refuses, nothing is deleted.
//
//   nop-agent-account-deletions    list, newest first, kept

const redis = Redis.fromEnv()
const LOG_KEY = "nop-agent-account-deletions"

export interface AgentAccountSummary {
  agentId: string
  /** The account holding the ID (or the pending sign-up's email). Null: no account, roster data only. */
  account: string | null
  name: string | null
  status: string | null
  leads: number
  events: number
  photo: boolean
  paidPro: boolean
}

/** What a deletion would remove, for the admin's confirmation and the dry run. */
export async function summarizeAgentAccount(agentId: string): Promise<AgentAccountSummary | null> {
  const [roster, owner] = await Promise.all([getRosterRecord(agentId), getAgentIdOwner(agentId)])
  const account = owner ?? roster?.rosterEmail ?? null
  const [leads, events, page, billing, profile] = await Promise.all([
    listAgentLeadIds(agentId),
    listAgentEvents(agentId),
    getAgentPageSettings(agentId),
    account ? getAgentBilling(account) : Promise.resolve(null),
    account ? redis.get(`client:${account}:agent-profile`) : Promise.resolve(null),
  ])
  if (!roster && !owner && !profile && leads.length === 0 && events.length === 0) return null
  const paidPro = !!billing?.subscriptionId && ["active", "trialing", "past_due"].includes(billing.status ?? "")
  return { agentId, account, name: roster?.agentName ?? null, status: roster?.status ?? null, leads: leads.length, events: events.length, photo: !!page.photo, paidPro }
}

export interface AccountDeletion {
  at: string
  agentId: string
  by: string
  reason: "admin" | "retention"
  note: string
  leads: number
  events: number
  photo: boolean
  billing: { cancelled: boolean; refunded: number; currency: string | null } | null
}

export type DeleteResult = { ok: true; deletion: AccountDeletion } | { ok: false; reason: "not_found" | "billing_failed"; message?: string }

export async function deleteAgentAccount(agentId: string, opts: { by: string; reason: "admin" | "retention"; note: string }): Promise<DeleteResult> {
  const summary = await summarizeAgentAccount(agentId)
  if (!summary) return { ok: false, reason: "not_found" }
  const roster = await getRosterRecord(agentId)
  const account = summary.account

  // Billing first: if Stripe refuses, stop with everything in place.
  let billing: RemovalBillingOutcome | null = null
  if (account) {
    billing = await endAgentProOnRemoval(account)
    if (billing.error) return { ok: false, reason: "billing_failed", message: billing.error }
  }

  const leadIds = await listAgentLeadIds(agentId)
  if (leadIds.length) await deleteAgentLeads(opts.by, agentId, leadIds, opts.reason === "retention" ? "retention" : "account_deleted", opts.note)
  const events = await deleteAgentEvents(agentId)
  const photo = await deleteAgentPageSettings(agentId)
  if (photo) await delBlob(photo.path).catch((err) => console.error(`[agent-deletion] couldn't delete photo ${photo.path}:`, err))
  await deleteAgentScans(agentId)
  await deleteAgentRecruiting(agentId, roster?.recruitedBy)
  await deleteTeamPicks(agentId)
  await redis.zrem(RETENTION_DUE_KEY, agentId)

  // The roster record and the ID lock: the Agent ID can be issued again.
  await deleteRosterRecord(agentId)
  await redis.del(`agent-id:${agentId}`)

  if (account) {
    const customerId = (await getAgentBilling(account))?.customerId
    const [password, plan] = await redis.mget<(string | null)[]>(`client:${account}:passwordHash`, `client:${account}:plan`)
    await redis.del(
      `agent-account:${account}`,
      `client:${account}:agent-profile`,
      `client:${account}:agent-tier`,
      `client:${account}:agent-tier-source`,
      `client:${account}:agent-billing`,
      `client:${account}:last-active`,
      // Only an agent-only account's sign-up date; a business account's stays.
      ...(password === null && plan === null ? [`client:${account}:createdAt`] : []),
      ...(customerId ? [`agent-billing:customer:${customerId}`] : []),
    )
  }

  const deletion: AccountDeletion = {
    at: new Date().toISOString(), agentId, by: opts.by, reason: opts.reason, note: opts.note,
    leads: leadIds.length, events, photo: !!photo,
    billing: billing && (billing.cancelled || billing.subscriptionId) ? { cancelled: billing.cancelled, refunded: billing.refunded, currency: billing.currency } : null,
  }
  await redis.lpush(LOG_KEY, deletion)
  console.log(`[agent-deletion] ${opts.by} deleted agent ${agentId} (${opts.reason}): ${deletion.leads} leads, ${events} events`)
  return { ok: true, deletion }
}

export async function listAccountDeletions(limit = 100): Promise<AccountDeletion[]> {
  return redis.lrange<AccountDeletion>(LOG_KEY, 0, limit - 1)
}
