import { Redis } from "@upstash/redis"
import { randomBytes } from "node:crypto"
import { createScopedToken, verifyScopedToken, type ScopedClaims } from "@/lib/auth"

// The health check's credential. NOT a session: a purpose-scoped token
// (see createScopedToken) bound to ONE request — the route, and that
// route's exact parameters — valid for 2 minutes and usable once. Only two
// GET handlers ever look for it (header X-Health-Token): the NOP
// render-check and the business flyer PDF. Every other route ignores the
// header, and the token can't pass as a session or org-admin cookie
// because its signature covers a different purpose.

const redis = Redis.fromEnv()

export const HEALTH_TOKEN_HEADER = "x-health-token"
const PURPOSE = "health-check"
const TTL_SECONDS = 120

export type HealthTarget =
  | { route: "nop-render-check"; template: string; format: string }
  | { route: "business-pdf"; email: string; flyerId: string; variant: string }

export async function mintHealthToken(target: HealthTarget): Promise<string> {
  return createScopedToken(PURPOSE, { ...target, jti: randomBytes(16).toString("base64url") }, TTL_SECONDS)
}

/**
 * The token's claims if the request carries a valid, unused health token
 * for exactly this target; null otherwise. Marks it used.
 */
export async function consumeHealthToken(request: Request, target: HealthTarget): Promise<ScopedClaims | null> {
  if (request.method !== "GET") return null
  const claims = await verifyScopedToken(PURPOSE, request.headers.get(HEALTH_TOKEN_HEADER))
  if (!claims?.jti) return null
  for (const [k, v] of Object.entries(target)) if (claims[k] !== v) return null
  const first = await redis.set(`health-token-used:${claims.jti}`, "1", { nx: true, ex: TTL_SECONDS * 2 })
  return first ? claims : null
}
