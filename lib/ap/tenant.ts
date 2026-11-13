import { NextResponse, type NextRequest } from "next/server"
import { ADMIN_SUB, getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { agentPlatformEnabled, apOff } from "./flag"
import { readApSession } from "./session"
import { getAgent, getOrgBySlug } from "./store"
import type { ApAgent, ApOrg } from "./types"

// The ONE tenant-isolation gate. Every /api/ap/[org]/... handler that returns
// or changes agent data calls requireOrgAgent, and every admin handler calls
// requireApAdmin. Handlers then use ONLY the org and agent returned here
// (never an id from the URL or body), so an agent of org A can't name org B's
// data in any request.
//
//   platform off                   -> 404 (apOff)
//   unknown org slug               -> 404
//   no / invalid ap_session        -> 401
//   session for a different org    -> 403
//   agent missing, other org, or not active -> 403

const json = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } })

export type OrgAgent = { org: ApOrg; agent: ApAgent }

export async function requireOrg(slug: string): Promise<{ org: ApOrg } | { response: NextResponse }> {
  if (!agentPlatformEnabled()) return { response: apOff() }
  const org = await getOrgBySlug(slug)
  if (!org) return { response: json(404, "not_found") }
  return { org }
}

/** Pure decision, so it can be tested without Redis or a request. */
export function tenantDecision(org: ApOrg, session: { agentId: string; orgId: string } | null, agent: ApAgent | null): 200 | 401 | 403 {
  if (!session) return 401
  if (session.orgId !== org.id) return 403
  if (!agent || agent.agentId !== session.agentId || agent.orgId !== org.id) return 403
  if (agent.status !== "active") return 403
  return 200
}

export async function requireOrgAgent(request: NextRequest, slug: string): Promise<OrgAgent | { response: NextResponse }> {
  const o = await requireOrg(slug)
  if ("response" in o) return o
  const session = readApSession(request.cookies)
  const agent = session && session.orgId === o.org.id ? await getAgent(session.agentId) : null
  const decision = tenantDecision(o.org, session, agent)
  if (decision === 401) return { response: json(401, "unauthorized") }
  if (decision === 403) return { response: json(403, "forbidden") }
  return { org: o.org, agent: agent! }
}

/** AP_ADMIN_EMAILS: comma-separated, lowercased. The owner password login always passes. */
export function apAdminAllowed(sub: string, allowlist = process.env.AP_ADMIN_EMAILS): boolean {
  if (sub === ADMIN_SUB) return true
  const list = (allowlist ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
  return list.includes(sub.toLowerCase())
}

/** The existing admin check, narrowed to the owner login plus AP_ADMIN_EMAILS. */
export async function apAdminFromCookies(cookies: { get(name: string): { value: string } | undefined }): Promise<string | null> {
  if (!agentPlatformEnabled()) return null
  const session = await getSessionIdentity({ cookies })
  if (!session) return null
  if (!apAdminAllowed(session.sub)) return null
  return (await isAdminSession(session.sub)) ? session.sub : null
}

export async function requireApAdmin(request: NextRequest): Promise<{ admin: string } | { response: NextResponse }> {
  if (!agentPlatformEnabled()) return { response: apOff() }
  const admin = await apAdminFromCookies(request.cookies)
  if (!admin) return { response: json(401, "unauthorized") }
  return { admin }
}
