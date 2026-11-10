import { Redis } from "@upstash/redis"

// When an agent account is deleted (by an admin, or by the 12-month job), the
// logs keep the FACT of each decision and action (Agent ID, when, who did it,
// what happened) but lose the person: their name, phone and email are
// replaced with "[deleted]" in
//
//   nop-signups:log           sign-up and name-change decisions
//   nop-program-status-log    remove / reactivate
//   agent-flags:nop           blocked registrations and other flags
//   admin-agent-views         admins opening the account (the per-email copy is deleted)
//   nop-admin-actions         every admin action (details that mention them)
//   nop-render-log:{agentId}  the flyer download record, and its global index
//   nop-render-log            (nop-render-log): kept, with the Agent ID only
//
// Admins' own identities (who did it) stay, including an admin who made a
// print file for the agent.
//
// Each entry is replaced where it stands, by exact match, in one script per
// list, so entries pushed meanwhile are neither lost nor reordered.

const redis = Redis.fromEnv()
export const REDACTED = "[deleted]"

const LOGS = { signups: "nop-signups:log", status: "nop-program-status-log", flags: "agent-flags:nop", views: "admin-agent-views", actions: "nop-admin-actions" } as const

// KEYS[1]: the list. ARGV: old, new, old, new… (JSON as stored). Each old is replaced where found.
const REPLACE = `
local n = 0
local items = redis.call("LRANGE", KEYS[1], 0, -1)
for i = 1, #ARGV, 2 do
  for j = 1, #items do
    if items[j] == ARGV[i] then
      redis.call("LSET", KEYS[1], j - 1, ARGV[i + 1])
      items[j] = ARGV[i + 1]
      n = n + 1
      break
    end
  end
end
return n`

export interface AgentIdentity {
  agentId: string
  /** Every email the agent used: account, roster, shown on flyers. */
  emails: string[]
  names: string[]
  phones: string[]
}

const digits = (s: string) => s.replace(/\D/g, "")

function redactor(who: AgentIdentity) {
  const emails = [...new Set(who.emails.filter(Boolean).map((e) => e.toLowerCase()))]
  const names = new Set(who.names.filter(Boolean).map((n) => n.trim().toLowerCase()))
  const phones = new Set(who.phones.map(digits).filter((d) => d.length >= 7))
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const emailRe = emails.length ? new RegExp(emails.map(escape).join("|"), "gi") : null
  // Emails are unique: redacted wherever they appear. A name or phone is redacted
  // only in entries about this agent (their Agent ID, or one of their emails).
  const value = (v: unknown, aboutAgent: boolean): unknown => {
    if (typeof v === "string") {
      if (aboutAgent && (names.has(v.trim().toLowerCase()) || (phones.has(digits(v)) && /^[\d\s()+.-]+$/.test(v)))) return REDACTED
      return emailRe ? v.replace(emailRe, REDACTED) : v
    }
    if (Array.isArray(v)) return v.map((x) => value(x, aboutAgent))
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x, aboutAgent)]))
    return v
  }
  return (entry: Record<string, unknown>) => {
    const raw = JSON.stringify(entry)
    const about = String(entry.agentId ?? "") === who.agentId || (emailRe !== null && new RegExp(emailRe.source, "i").test(raw))
    return value(entry, about) as Record<string, unknown>
  }
}

/** The personal fields of a log entry about this agent, whatever they matched. */
const ABOUT_AGENT: Record<keyof typeof LOGS, string[]> = {
  signups: ["account", "name", "phone", "previousName"],
  status: ["account"],
  flags: [],
  views: ["agentEmail"],
  actions: [],
}

async function redactList(key: string, fields: string[], who: AgentIdentity): Promise<number> {
  const entries = (await redis.lrange<Record<string, unknown>>(key, 0, -1)) ?? []
  const redact = redactor(who)
  const pairs: string[] = []
  for (const e of entries) {
    if (!e || typeof e !== "object") continue
    let next = redact(e)
    if (String(e.agentId ?? "") === who.agentId) for (const f of fields) if (f in next && next[f] !== null) next = { ...next, [f]: REDACTED }
    const before = JSON.stringify(e), after = JSON.stringify(next)
    if (before !== after) pairs.push(before, after)
  }
  if (pairs.length === 0) return 0
  return Number(await redis.eval(REPLACE, [key], pairs))
}

/** Redacts the agent from every admin log; returns how many entries changed. */
export async function redactAgentFromLogs(who: AgentIdentity): Promise<number> {
  let n = 0
  for (const [name, key] of Object.entries(LOGS) as [keyof typeof LOGS, string][]) n += await redactList(key, ABOUT_AGENT[name], who)
  // The download record keeps every entry, with the Agent ID only: the agent's email (account) goes.
  for (const key of [`nop-render-log:${who.agentId}`, "nop-render-log"]) n += await redactList(key, [], who)
  await redis.del(...who.emails.filter(Boolean).map((e) => `admin-agent-views:${e.toLowerCase()}`))
  return n
}
