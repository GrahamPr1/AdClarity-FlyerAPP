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

/** SHA-256 hex digest — used to store one-time password-reset tokens as hashes, never plaintext. */
export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data))
  return Buffer.from(digest).toString("hex")
}

// ---- Client passwords -------------------------------------------------------
//
// PBKDF2 via Web Crypto (SubtleCrypto), not bcrypt/scrypt — this needs to run
// wherever getSessionIdentity does (middleware.ts runs on Edge, which has no
// Node crypto or native bcrypt bindings), and SubtleCrypto is the one hashing
// primitive available in both runtimes. 100k iterations is a reasonable
// modern floor for PBKDF2-SHA256; the iteration count is stored alongside
// each hash (not hardcoded at verify time) so a future bump doesn't
// invalidate passwords hashed under the old count.

const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEY_LENGTH_BITS = 256
const SALT_BYTES = 16

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
  const derived = await crypto.subtle.deriveBits(
    // Uint8Array genuinely satisfies BufferSource at runtime; the cast is
    // only needed because this lib's Uint8Array<ArrayBufferLike> type
    // doesn't structurally narrow to the DOM lib's stricter BufferSource.
    { name: "PBKDF2", salt: hexToBytes(saltHex) as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_KEY_LENGTH_BITS,
  )
  return Buffer.from(derived).toString("hex")
}

/** Stored format: "<iterations>:<saltHex>:<hashHex>" — a fresh random salt every time, so two clients with the same password never produce the same stored value. */
export async function hashPassword(password: string): Promise<string> {
  const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(SALT_BYTES))).toString("hex")
  const hash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS)
  return `${PBKDF2_ITERATIONS}:${salt}:${hash}`
}

/** Constant-time-ish comparison — never short-circuits on the first differing byte, so response timing doesn't leak how much of a guess was correct. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterationsStr, salt, hash] = stored.split(":")
  const iterations = Number(iterationsStr)
  if (!iterations || !salt || !hash) return false

  const candidate = await pbkdf2Hex(password, salt, iterations)
  if (candidate.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
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
