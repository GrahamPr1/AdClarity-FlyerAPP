import { Redis } from "@upstash/redis"
import { getAgentIdOwner } from "@/lib/enterprise/agents-store"
import { listNopRenders } from "@/lib/enterprise/nop-render/log"
import { NOP_DOWNLOAD_FORMATS } from "@/lib/enterprise/nop-render/render"
import { NOP_V2_PACKAGES, NOP_V2_PRICING, type AgentFlyerKit } from "@/lib/enterprise/nop-render/kit-v2-ids"
import type { NopLang } from "@/lib/enterprise/nop-i18n"
import { countAgentLeads } from "./agent-data"
import { canUse } from "./features"
import { loadPortalContext } from "./context"
import { listRecruits, type RecruitStatus } from "./recruiting"
import { getLastActive } from "./store"

// The Leader team dashboard (Phase 7). A Leader's team is the agents who
// signed up through their recruit link (recruiting.ts): direct recruits only.
// Leader is set by an admin, never by billing.
//
// The Leader sees each team member's name and status and, for approved
// members, activity COUNTS only: flyers downloaded, number of leads, last
// active. Never a lead's details.
//
// "Send to team": the Leader picks one of the program's flyers (a package, and
// with/without prices on kit v2). It shows on each approved team member's Home
// tab, made with the member's own details, in the member's language when the
// kit has it. No free text: nothing a Leader writes reaches the team. A pick
// made for one kit stays hidden while the other kit is in use.
//
//   nop-agent:{leaderId}:team-picks    list of TeamPick, newest first (at most MAX_PICKS)

const redis = Redis.fromEnv()
const picksKey = (leaderId: string) => `nop-agent:${leaderId}:team-picks`
export const MAX_PICKS = 5

export interface TeamMember {
  agentId: string
  name: string
  status: RecruitStatus
  signedUpAt: string
  /** Approved members only; null otherwise. */
  activity: { flyersMade: number; leads: number; lastActive: string | null } | null
}

const isDownload = (format: string) => (NOP_DOWNLOAD_FORMATS as readonly string[]).includes(format)

/** The Leader's team, newest sign-up first, with counts for approved members. */
export async function listTeam(leaderId: string): Promise<TeamMember[]> {
  const recruits = await listRecruits(leaderId)
  return Promise.all(recruits.map(async (r) => {
    if (r.status !== "approved") return { ...r, activity: null }
    const owner = await getAgentIdOwner(r.agentId)
    const [renders, leads, [lastActive]] = await Promise.all([
      listNopRenders({ agentId: r.agentId }),
      countAgentLeads(r.agentId),
      owner ? getLastActive([owner]) : Promise.resolve([null]),
    ])
    return { ...r, activity: { flyersMade: renders.filter((e) => isDownload(e.format)).length, leads, lastActive } }
  }))
}

// ---- Send to team -------------------------------------------------------------------

export interface TeamPick {
  id: string
  kit: "v1" | "v2"
  /** P1, P2, P3 (both kits), ALL (v1 only). */
  pkg: string
  /** Kit v2 only. */
  pricing: "PRICE" | "NOPRICE" | null
  at: string
}

const V1_PACKAGES = ["P1", "P2", "P3", "ALL"]

/** A pick from the request body, checked against the kit in use now; null if it isn't one of its flyers. */
export function checkPick(raw: { pkg?: unknown; pricing?: unknown }, kit: AgentFlyerKit): Omit<TeamPick, "id" | "at"> | null {
  const pkg = typeof raw.pkg === "string" ? raw.pkg : ""
  if (kit.kit === "v1") return V1_PACKAGES.includes(pkg) ? { kit: "v1", pkg, pricing: null } : null
  const pricing = raw.pricing
  if (!(NOP_V2_PACKAGES as readonly string[]).includes(pkg) || !(NOP_V2_PRICING as readonly unknown[]).includes(pricing)) return null
  return { kit: "v2", pkg, pricing: pricing as "PRICE" | "NOPRICE" }
}

/** The flyer template a member opens for a pick, in their language when the kit offers it. Null: not in the kit in use. */
export function pickTemplate(pick: Pick<TeamPick, "kit" | "pkg" | "pricing">, kit: AgentFlyerKit, lang: NopLang): string | null {
  if (pick.kit !== kit.kit) return null
  const code = (lang === "es" && kit.spanish ? "es" : "en").toUpperCase()
  return pick.kit === "v1" ? `NOP_${pick.pkg}_${code}` : `NOP2_${pick.pkg}_${code}_${pick.pricing}`
}

export async function listPicks(leaderId: string): Promise<TeamPick[]> {
  return redis.lrange<TeamPick>(picksKey(leaderId), 0, MAX_PICKS - 1)
}

/** Adds a pick (the same flyer again just moves it to the top). Keeps the newest MAX_PICKS. */
export async function addPick(leaderId: string, pick: Omit<TeamPick, "id" | "at">): Promise<TeamPick[]> {
  const same = (p: TeamPick) => p.kit === pick.kit && p.pkg === pick.pkg && p.pricing === pick.pricing
  const kept = (await listPicks(leaderId)).filter((p) => !same(p))
  const next = [{ ...pick, id: crypto.randomUUID(), at: new Date().toISOString() }, ...kept].slice(0, MAX_PICKS)
  await redis.del(picksKey(leaderId))
  await redis.rpush(picksKey(leaderId), ...next)
  return next
}

export async function removePick(leaderId: string, id: string): Promise<TeamPick[]> {
  const next = (await listPicks(leaderId)).filter((p) => p.id !== id)
  await redis.del(picksKey(leaderId))
  if (next.length) await redis.rpush(picksKey(leaderId), ...next)
  return next
}

/**
 * What an approved team member's Home shows: their recruiter's picks, while
 * that recruiter is an active Leader with the team dashboard on. Else nothing.
 */
export async function picksForMember(recruitedBy: string | null | undefined): Promise<{ leaderName: string; picks: TeamPick[] } | null> {
  if (!recruitedBy) return null
  const owner = await getAgentIdOwner(recruitedBy)
  const ctx = owner ? await loadPortalContext(owner) : null
  if (!ctx || ctx.agent.agentId !== recruitedBy || !canUse(ctx, "team")) return null
  const picks = await listPicks(recruitedBy)
  return picks.length ? { leaderName: ctx.agent.profile.displayName ?? ctx.agent.profile.name, picks } : null
}

/** Account deletion: the Leader's sent flyers. */
export async function deleteTeamPicks(agentId: string): Promise<void> {
  await redis.del(picksKey(agentId))
}
