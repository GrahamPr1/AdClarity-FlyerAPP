import { Redis } from "@upstash/redis"

// ---------------------------------------------------------------------------
// Fixed-window rate limiting for auth endpoints.
//
// Uses the Upstash Redis instance the app already depends on — no new
// dependency and no new service. A fixed window (rather than a sliding one)
// is deliberate: it's two Redis commands, and the failure mode of a fixed
// window (allowing up to 2x the limit across a window boundary) is
// irrelevant at the thresholds used here, where the point is to turn
// "unlimited automated guesses" into "a handful per window".
//
// Motivating case: POST /api/auth/login compares a plaintext password
// against DASHBOARD_PASSWORD with no KDF cost, and that single credential
// grants ADMIN_SUB — which can change any client's plan, grant admin, and
// act on any user's data. Unlimited free guesses against it was the highest
// -value realistic attack on this app.
// ---------------------------------------------------------------------------

const redis = Redis.fromEnv()

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the current window resets — for a Retry-After header. */
  retryAfterSeconds: number
}

/**
 * Counts one attempt against `key` and reports whether it's allowed.
 *
 * Fails OPEN if Redis is unreachable. That's a deliberate trade: an auth
 * endpoint that hard-fails whenever the rate-limit store hiccups would lock
 * every legitimate user out of the product, which is a worse and much more
 * likely outcome than the brief window of unthrottled guessing it prevents.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const bucket = `ratelimit:${key}`
  try {
    const count = await redis.incr(bucket)
    // Only set the TTL on the first hit of a window, so a burst of attempts
    // can't keep pushing the expiry out and extend its own lockout forever.
    if (count === 1) await redis.expire(bucket, windowSeconds)

    if (count > limit) {
      const ttl = await redis.ttl(bucket)
      return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  } catch {
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

/**
 * Best-effort client IP. Vercel sets x-forwarded-for; the leftmost entry is
 * the original client. Falls back to a shared bucket, which means an
 * unidentifiable caller shares a limit with all other unidentifiable callers
 * — restrictive rather than permissive, which is the right way to fail here.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]!.trim()
  return headers.get("x-real-ip")?.trim() || "unknown"
}
