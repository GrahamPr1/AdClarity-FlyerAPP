import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"
import { FLOW_TTL_SECONDS, getFlow, type FlowState } from "./access-store"
import { ORG_ADMIN_FLOW_COOKIE, orgAdminCookieOptions } from "./org-admins"

// HTTP plumbing for /api/enterprise/nop/org-admin/*. Same code machinery as
// agent sign-in (lib/enterprise/access-store.ts), its own flow cookie, and
// only flows of kind "org-admin" are ever accepted here.

export async function readOrgAdminFlow(request: NextRequest): Promise<{ id: string; state: FlowState } | null> {
  const id = request.cookies.get(ORG_ADMIN_FLOW_COOKIE)?.value
  const state = await getFlow(id)
  return id && state && state.kind === "org-admin" ? { id, state } : null
}

export function setOrgAdminFlowCookie(res: NextResponse, id: string) {
  res.cookies.set(ORG_ADMIN_FLOW_COOKIE, id, orgAdminCookieOptions(FLOW_TTL_SECONDS))
}

export function clearOrgAdminFlowCookie(res: NextResponse) {
  res.cookies.set(ORG_ADMIN_FLOW_COOKIE, "", orgAdminCookieOptions(0))
}

export function orgAdminFail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, message, ...extra }, { status })
}

export async function orgAdminRateLimit(request: NextRequest, step: string, subject: string): Promise<NextResponse | null> {
  const [byIp, bySubject] = await Promise.all([
    checkRateLimit(`nop-org-admin:${step}:ip:${clientIp(request.headers)}`, 30, 15 * 60),
    checkRateLimit(`nop-org-admin:${step}:sub:${subject}`, 10, 15 * 60),
  ])
  const blocked = !byIp.allowed ? byIp : !bySubject.allowed ? bySubject : null
  if (!blocked) return null
  const res = orgAdminFail(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.")
  res.headers.set("Retry-After", String(blocked.retryAfterSeconds))
  return res
}
