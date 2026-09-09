import { checkRateLimit } from "@/lib/rate-limit"

/**
 * Shared limits for the goal-driven routes.
 *
 * Keyed by account, not IP: these are all authenticated, and per-account is
 * the same granularity the flyer quota already uses. An IP key would punish
 * a shared office network and do nothing about one account in a loop.
 *
 * PARSE covers /api/goal-parser and the plan step — both make a real model
 * call (~$0.005 each) and neither consumes flyer quota, so nothing else
 * bounds them. This was the gap flagged when goal-parser shipped.
 *
 * EXECUTE is deliberately looser than it looks: real generation is already
 * hard-capped by reserveFlyerQuota against the monthly plan limit. This only
 * stops a rapid-fire loop from burning a whole month's allowance in seconds.
 */
export const GOAL_PARSE_LIMIT = { max: 20, windowSeconds: 60 * 60 }
export const GOAL_EXECUTE_LIMIT = { max: 10, windowSeconds: 60 * 60 }

export async function checkGoalRateLimit(
  email: string,
  scope: "parse" | "execute",
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { max, windowSeconds } = scope === "parse" ? GOAL_PARSE_LIMIT : GOAL_EXECUTE_LIMIT
  const { allowed, retryAfterSeconds } = await checkRateLimit(`goal-${scope}:${email}`, max, windowSeconds)
  return { allowed, retryAfterSeconds }
}
