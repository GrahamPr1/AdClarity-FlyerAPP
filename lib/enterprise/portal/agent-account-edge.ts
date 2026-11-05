import { Redis } from "@upstash/redis"

// The one lookup middleware needs: does this account hold a NOP Agent ID?
// Kept apart from agents-store.ts so the Edge bundle doesn't pull in the
// whole store. Same key as agents-store's agentAccountKey.

const redis = Redis.fromEnv()

export async function holdsAgentId(email: string): Promise<boolean> {
  return (await redis.get(`agent-account:${email}`)) != null
}
