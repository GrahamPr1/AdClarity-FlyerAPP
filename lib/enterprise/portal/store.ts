import { Redis } from "@upstash/redis"
import { NOP_ORG_ID } from "@/lib/enterprise/nop-roster"
import { AGENT_FEATURES, defaultOrgFeatures, isAgentTier, type AgentFeature, type AgentTier, type OrgFeatures } from "./features"

// Redis for the agent portal. Own client, the same as agents-store.ts.
//
//   client:{email}:agent-tier            "basic" | "pro" | "leader" (unset = basic)
//   client:{email}:agent-tier-source     "admin" | "stripe": who set the tier (unset = admin; before
//                                        agent billing, every tier was admin-set). See agent-billing.ts.
//   client:{email}:last-active           ISO time of the agent's last portal visit (written at most every 10 min)
//   enterprise-org:{orgId}:features      hash, feature -> "on" | "off" (unset = the org default)
//   admin-agent-views                    every admin view of an agent account, newest first
//   admin-agent-views:{email}            the same, for one agent
//
// Per-agent keys sit under client:{email}:*, so the existing account
// deletion (collectAccountKeys) already takes them. Tier is its own key, never
// client.plan: Stripe owns that one, and the SMB plan names overlap.

const redis = Redis.fromEnv()

const tierKey = (email: string) => `client:${email}:agent-tier`
const tierSourceKey = (email: string) => `client:${email}:agent-tier-source`
const lastActiveKey = (email: string) => `client:${email}:last-active`
const featuresKey = (orgId: string) => `enterprise-org:${orgId}:features`
const VIEWS_KEY = "admin-agent-views"
const viewsKey = (email: string) => `${VIEWS_KEY}:${email}`

// ---- Tier ---------------------------------------------------------------------

export async function getAgentTier(email: string): Promise<AgentTier> {
  const v = await redis.get(tierKey(email))
  return isAgentTier(v) ? v : "basic"
}

export async function setAgentTier(email: string, tier: AgentTier, source: "admin" | "stripe" = "admin"): Promise<void> {
  await Promise.all([redis.set(tierKey(email), tier), redis.set(tierSourceKey(email), source)])
}

/** Who set the tier: "admin", "stripe" (a paid subscription), or null when never set (Basic). */
export async function getAgentTierSource(email: string): Promise<"admin" | "stripe" | null> {
  const [tier, source] = await Promise.all([redis.get(tierKey(email)), redis.get<string>(tierSourceKey(email))])
  if (source === "stripe" || source === "admin") return source
  return tier == null ? null : "admin"
}

// ---- Org feature switches --------------------------------------------------------

export async function getOrgFeatures(orgId: string): Promise<OrgFeatures> {
  const stored = (await redis.hgetall<Record<string, string>>(featuresKey(orgId))) ?? {}
  const out = defaultOrgFeatures(orgId === NOP_ORG_ID)
  for (const f of AGENT_FEATURES) {
    if (stored[f] === "on") out[f] = true
    else if (stored[f] === "off") out[f] = false
  }
  return out
}

export async function setOrgFeature(orgId: string, feature: AgentFeature, enabled: boolean): Promise<OrgFeatures> {
  await redis.hset(featuresKey(orgId), { [feature]: enabled ? "on" : "off" })
  return getOrgFeatures(orgId)
}

// ---- Activity ----------------------------------------------------------------------

const TOUCH_EVERY_MS = 10 * 60 * 1000

/** Records a real agent's portal visit. Never for an admin viewing as the agent. */
export async function touchLastActive(email: string, now = new Date()): Promise<void> {
  const prev = await redis.get<string>(lastActiveKey(email))
  if (prev && now.getTime() - Date.parse(prev) < TOUCH_EVERY_MS) return
  await redis.set(lastActiveKey(email), now.toISOString())
}

export async function getLastActive(emails: string[]): Promise<(string | null)[]> {
  if (emails.length === 0) return []
  return (await redis.mget<(string | null)[]>(...emails.map(lastActiveKey))).map((v) => (v == null ? null : String(v)))
}

// ---- Admin views of agent accounts (kept, never trimmed) -----------------------------

export interface AdminAgentView {
  /** The admin's session identity ("admin" for the site owner). */
  admin: string
  agentEmail: string
  agentId: string | null
  /** "detail": opened the account; "view-as": opened their portal read-only. */
  kind: "detail" | "view-as"
  at: string
}

export async function logAdminAgentView(view: Omit<AdminAgentView, "at">): Promise<AdminAgentView> {
  const full: AdminAgentView = { ...view, at: new Date().toISOString() }
  await Promise.all([redis.lpush(VIEWS_KEY, full), redis.lpush(viewsKey(view.agentEmail), full)])
  return full
}

export async function listAdminAgentViews(opts: { agentEmail?: string; limit?: number } = {}): Promise<AdminAgentView[]> {
  const key = opts.agentEmail ? viewsKey(opts.agentEmail) : VIEWS_KEY
  return redis.lrange<AdminAgentView>(key, 0, (opts.limit ?? 200) - 1)
}
