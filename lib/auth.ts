const SESSION_COOKIE = "dashboard_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

/** Reserved `sub` value for the single site-owner admin login (DASHBOARD_PASSWORD). */
export const ADMIN_SUB = "admin"

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET is not set")
  return secret
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return Buffer.from(sig).toString("base64url")
}

/** SHA-256 hex digest — used to store one-time client access codes as hashes, never plaintext. */
export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data))
  return Buffer.from(digest).toString("hex")
}

interface SessionPayload {
  /** ADMIN_SUB for the site-owner login, or a client's normalized email. */
  sub: string
  exp: number
}

/** Creates a signed session token: "<base64url-json-payload>.<signature>" */
export async function createSessionToken(sub: string): Promise<string> {
  const payload: SessionPayload = { sub, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = await hmac(payloadStr, getSecret())
  return `${payloadStr}.${signature}`
}

/** Verifies a session token's signature and expiry, returning its identity — Edge-runtime safe. */
export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  const [payloadStr, signature] = token.split(".")
  if (!payloadStr || !signature) return null

  const expected = await hmac(payloadStr, getSecret())
  if (expected !== signature) return null // tampered or wrong secret

  let payload: SessionPayload
  try {
    payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"))
  } catch {
    return null
  }

  if (!payload.sub || Number.isNaN(payload.exp) || Date.now() > payload.exp) return null // malformed or expired

  return payload
}

/**
 * Checks the dashboard session cookie on an API request — the same check
 * middleware.ts does for page navigation, but middleware's matcher only
 * covers /dashboard/:path*, not API routes. Any route that returns or
 * accepts real client data needs this called explicitly.
 */
export async function isAuthedRequest(request: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  return (await getSessionIdentity(request)) !== null
}

/** Returns the authenticated session's identity (admin or a client email), or null if unauthenticated. */
export async function getSessionIdentity(request: {
  cookies: { get(name: string): { value: string } | undefined }
}): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  return verifySessionToken(token)
}

export { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS }
