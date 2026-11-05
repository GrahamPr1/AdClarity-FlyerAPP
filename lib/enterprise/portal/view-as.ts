import { NextResponse, type NextRequest } from "next/server"
import { ADMIN_SUB, getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"

// "View as agent": a OneFlyer admin opens an agent's real portal, read-only.
//
// It never uses the agent's session. The admin keeps their own session, and a
// separate signed cookie names the agent being viewed. Pages read it to show
// that agent's screens; every agent WRITE route refuses while the cookie is
// present at all (rejectWhileViewingAs), whoever's browser it's in.
//
// Signed with SESSION_SECRET under its own prefix, and its payload has no
// `sub`, so it can never pass as a session token, nor a session as this.

export const VIEW_AS_COOKIE = "oneflyer_view_as"
export const VIEW_AS_MAX_AGE_SECONDS = 60 * 60

interface ViewAsPayload {
  kind: "view-as"
  /** The admin session's identity that started it. */
  admin: string
  /** The agent account being viewed. */
  agent: string
  exp: number
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET is not set")
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`view-as.${data}`))
  return Buffer.from(sig).toString("base64url")
}

export async function createViewAsToken(admin: string, agent: string, now = Date.now()): Promise<string> {
  const payload: ViewAsPayload = { kind: "view-as", admin, agent, exp: now + VIEW_AS_MAX_AGE_SECONDS * 1000 }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${body}.${await hmac(body)}`
}

export async function verifyViewAsToken(token: string | undefined, now = Date.now()): Promise<ViewAsPayload | null> {
  if (!token) return null
  const [body, sig] = token.split(".")
  if (!body || !sig || (await hmac(body)) !== sig) return null
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ViewAsPayload
    if (p.kind !== "view-as" || !p.admin || !p.agent || !(p.exp > now)) return null
    return p
  } catch {
    return null
  }
}

type CookieReader = { cookies: { get(name: string): { value: string } | undefined } }

/** True whenever the cookie is there, valid or not: writes refuse on its mere presence. */
export function viewingAsCookiePresent(req: CookieReader): boolean {
  return req.cookies.get(VIEW_AS_COOKIE) !== undefined
}

/** For every agent write route, first thing. */
export function rejectWhileViewingAs(req: CookieReader): NextResponse | null {
  if (!viewingAsCookiePresent(req)) return null
  return NextResponse.json(
    { error: "read_only", message: "You're viewing an agent's portal read-only. Exit the view to make changes." },
    { status: 403 },
  )
}

/**
 * Who a portal page or read route is for:
 *   - a signed-in client (not admin): their own account
 *   - an admin with a valid view-as cookie that THEY started: that agent, read-only
 * Anyone else gets null. An admin without the cookie is not an agent.
 */
export type PortalViewer = { email: string; viewAs: null } | { email: string; viewAs: { admin: string } }

export async function resolvePortalViewer(req: CookieReader): Promise<PortalViewer | null> {
  const session = await getSessionIdentity(req)
  if (!session) return null
  const token = req.cookies.get(VIEW_AS_COOKIE)?.value
  if (token && (await isAdminSession(session.sub))) {
    const p = await verifyViewAsToken(token)
    if (p && p.admin === session.sub) return { email: p.agent, viewAs: { admin: session.sub } }
    return null
  }
  if (session.sub === ADMIN_SUB) return null
  return { email: session.sub, viewAs: null }
}

/** For agent READ routes: the viewer, or the 401 to return. */
export async function requirePortalViewer(req: NextRequest): Promise<PortalViewer | { response: NextResponse }> {
  const viewer = await resolvePortalViewer(req)
  if (!viewer) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  return viewer
}
