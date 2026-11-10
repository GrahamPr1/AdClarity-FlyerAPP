import { Redis } from "@upstash/redis"

// The optional Pro free trial (admin setting, OFF by default). When on, an
// agent who has never had a trial or a Pro subscription gets the set number
// of days free at checkout: Stripe Checkout still requires a card, and Stripe
// charges it when the trial ends unless they cancel first. One trial per agent
// ever: marked by Agent ID and by account email once Stripe reports a
// subscription that had a trial (agent-billing.ts syncAgentSubscription).
//
//   nop-pro-trial                         { enabled, days, updatedBy, updatedAt }
//   nop-pro-trial-log                     every change, newest first
//   nop-agent:{agentId}:pro-trial-used    when
//   client:{email}:agent-pro-trial-used   when

const redis = Redis.fromEnv()
const KEY = "nop-pro-trial"
const LOG_KEY = "nop-pro-trial-log"
export const TRIAL_DAYS = { min: 1, max: 30, default: 14 } as const

export interface ProTrialSetting {
  enabled: boolean
  days: number
  updatedBy: string | null
  updatedAt: string | null
}

export async function getProTrialSetting(): Promise<ProTrialSetting> {
  const s = await redis.get<ProTrialSetting>(KEY)
  return s ?? { enabled: false, days: TRIAL_DAYS.default, updatedBy: null, updatedAt: null }
}

export async function setProTrialSetting(enabled: boolean, days: number, by: string): Promise<ProTrialSetting | null> {
  if (!Number.isInteger(days) || days < TRIAL_DAYS.min || days > TRIAL_DAYS.max) return null
  const next: ProTrialSetting = { enabled, days, updatedBy: by, updatedAt: new Date().toISOString() }
  await redis.set(KEY, next)
  await redis.lpush(LOG_KEY, next)
  return next
}

export async function listProTrialLog(limit = 20): Promise<ProTrialSetting[]> {
  return redis.lrange<ProTrialSetting>(LOG_KEY, 0, limit - 1)
}

const usedAgentKey = (agentId: string) => `nop-agent:${agentId}:pro-trial-used`
const usedEmailKey = (email: string) => `client:${email}:agent-pro-trial-used`

export async function markProTrialUsed(email: string, agentId: string | null, at = new Date()): Promise<void> {
  await redis.set(usedEmailKey(email), at.toISOString(), { nx: true })
  if (agentId) await redis.set(usedAgentKey(agentId), at.toISOString(), { nx: true })
}

/**
 * The trial days this agent would get at checkout now, or null: the trial is
 * off, or they already had a trial, or they've had a Pro subscription before.
 */
export async function proTrialDaysFor(email: string, agentId: string, hadSubscription: boolean): Promise<number | null> {
  const setting = await getProTrialSetting()
  if (!setting.enabled || hadSubscription) return null
  const [a, e] = await Promise.all([redis.get(usedAgentKey(agentId)), redis.get(usedEmailKey(email))])
  return a || e ? null : setting.days
}
