const SESSION_COOKIE = "dashboard_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

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

/** Creates a signed session token: "<expiryTimestamp>.<signature>" */
export async function createSessionToken(): Promise<string> {
  const expires = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const payload = String(expires)
  const signature = await hmac(payload, getSecret())
  return `${payload}.${signature}`
}

/** Verifies a session token's signature and expiry. Edge-runtime safe. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return false

  const expected = await hmac(payload, getSecret())
  if (expected !== signature) return false // tampered or wrong secret

  const expires = Number(payload)
  if (Number.isNaN(expires) || Date.now() > expires) return false // expired

  return true
}

/**
 * Checks the dashboard session cookie on an API request — the same check
 * middleware.ts does for page navigation, but middleware's matcher only
 * covers /dashboard/:path*, not API routes. Any route that returns or
 * accepts real client data needs this called explicitly.
 */
export async function isAuthedRequest(request: { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  return verifySessionToken(token)
}

export { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS }
