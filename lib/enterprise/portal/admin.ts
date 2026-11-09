import { NextResponse, type NextRequest } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { getAgentProfile } from "@/lib/store"
import { getRosterRecord, listRoster } from "@/lib/enterprise/agents-store"
import { NOP_ORG_ID, NOP_ORG_NAME } from "@/lib/enterprise/nop-roster"
import { listNopRenders, type NopRenderLogEntry } from "@/lib/enterprise/nop-render/log"
import { NOP_DOWNLOAD_FORMATS } from "@/lib/enterprise/nop-render/render"
import type { AgentTier } from "./features"
import { getAgentTier, getAgentTierSource, getLastActive, listAdminAgentViews, type AdminAgentView } from "./store"
import { agentBillingLabel, getAgentBilling, type AgentBillingLabel } from "./agent-billing"
import { summarizeAgentData } from "./agent-data"

// OneFlyer admin's view of agent accounts. Read-only helpers; the routes that
// change anything (tier, org switches, view-as) are in app/api/admin/enterprise.

/** For every admin agent route: the admin's identity, or the 401 to return. Non-admins never get further. */
export async function requireAdmin(request: NextRequest): Promise<{ admin: string } | { response: NextResponse }> {
  const session = await getSessionIdentity(request)
  if (!session || !(await isAdminSession(session.sub))) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  return { admin: session.sub }
}

export interface AgentRow {
  email: string
  agentId: string
  name: string
  orgId: string
  orgName: string
  tier: AgentTier
  /** Paid Pro (Stripe), admin-set (e.g. an org paying), cancelling, past due, cancelled, or none. */
  billing: AgentBillingLabel
  /** End of the paid period, when Stripe billing exists. */
  paidUntil: string | null
  status: string
  lastActive: string | null
  /** Downloads (print, home-print, social): flyers actually made. Previews aren't counted. */
  flyersMade: number
  /** Everything under the Agent ID, whatever the tier: the org and admin see totals for every agent. */
  leads: number
  scans: number
}

const isDownload = (e: NopRenderLogEntry) => (NOP_DOWNLOAD_FORMATS as readonly string[]).includes(e.format)

/** Every agent ACCOUNT (a roster Agent ID locked to an account), grouped by org on the page. */
export async function listAgentRows(): Promise<AgentRow[]> {
  const roster = (await listRoster()).filter((r) => r.lockedTo)
  const emails = roster.map((r) => r.lockedTo!)
  const lastActive = await getLastActive(emails)
  return Promise.all(
    roster.map(async (r, i) => {
      const email = r.lockedTo!
      const [profile, tier, renders, data, tierSource, billingRecord] = await Promise.all([
        getAgentProfile(email),
        getAgentTier(email),
        listNopRenders({ agentId: r.agentId }),
        summarizeAgentData(r.agentId),
        getAgentTierSource(email),
        getAgentBilling(email),
      ])
      return {
        email,
        agentId: r.agentId,
        name: profile?.displayName ?? profile?.name ?? r.agentName,
        orgId: profile?.orgId ?? NOP_ORG_ID,
        orgName: NOP_ORG_NAME,
        tier,
        billing: agentBillingLabel(tier, tierSource, billingRecord),
        paidUntil: billingRecord?.currentPeriodEnd ?? null,
        status: r.status,
        lastActive: lastActive[i],
        flyersMade: renders.filter(isDownload).length,
        leads: data.leads,
        scans: data.scans,
      }
    }),
  )
}

export interface AgentDetail extends AgentRow {
  companyName: string
  phone: string
  /** Phase 6: filled from the roster's recruiter field. */
  recruiter: null
  team: []
  recentActivity: NopRenderLogEntry[]
  views: AdminAgentView[]
}

export async function getAgentDetail(email: string): Promise<AgentDetail | null> {
  const row = (await listAgentRows()).find((r) => r.email === email)
  if (!row) return null
  const [profile, roster, renders, views] = await Promise.all([
    getAgentProfile(email),
    getRosterRecord(row.agentId),
    listNopRenders({ agentId: row.agentId, limit: 25 }),
    listAdminAgentViews({ agentEmail: email, limit: 50 }),
  ])
  return {
    ...row,
    companyName: roster?.companyName ?? profile?.companyName ?? "",
    phone: profile?.displayPhone ?? profile?.phone ?? "",
    recruiter: null,
    team: [],
    recentActivity: renders,
    views,
  }
}
