/**
 * Seeds the local DEV database with the accounts the browser tests log in as.
 *
 *   npm run seed:dev
 *
 * Safe by construction: it refuses to run unless the connected database is
 * marked `development` (see assertRedisMatchesEnvironment), so it can never
 * create accounts in production. Every address uses the reserved `.invalid`
 * TLD, which can never resolve or receive mail.
 *
 * One account per (role, browser engine): the sign-in route rate-limits per
 * account, and Playwright runs chromium/firefox/webkit in parallel, so a
 * shared login would trip that limiter and fail tests for the wrong reason.
 */
import "./load-env"
import { setClientPlan, setClientPasswordHash, setClientBusinessName, assertRedisMatchesEnvironment } from "../lib/store"
import { hashPassword } from "../lib/auth"
import { getAppEnvironment } from "../lib/env"

const PASSWORD = "DevTest!2345"
const PROJECTS = ["chromium", "firefox", "webkit"] as const
const ROLES = [
  { slug: "basic", plan: "basic" },
  { slug: "trial", plan: "trial" },
  { slug: "intake", plan: "basic" },
] as const

async function main() {
  const env = getAppEnvironment()
  if (env !== "development") {
    throw new Error(`seed:dev refuses to run in "${env}" — it only ever seeds the local development database.`)
  }
  // Belt and braces: also verify the DATABASE says it's development, not just
  // this process. A misconfigured URL is exactly the failure this catches.
  await assertRedisMatchesEnvironment()

  const { Redis } = await import("@upstash/redis")
  const redis = Redis.fromEnv()

  const passwordHash = await hashPassword(PASSWORD)
  const created: string[] = []

  for (const project of PROJECTS) {
    for (const role of ROLES) {
      const email = `qr-${role.slug}-${project}@dev.invalid`
      await setClientPlan(email, role.plan)
      await setClientPasswordHash(email, passwordHash)
      created.push(`${email}  (${role.plan})`)
    }
  }

  // The audit/deletion tests need two more fixtures: an admin to call the
  // endpoint as, and a record that reads as a genuine customer, so the test
  // can prove the server REFUSES to delete a real one.
  // Per engine again, for the same reason as above: five audit tests times
  // three engines signing in as one admin trips the per-account limiter.
  for (const project of PROJECTS) {
    const adminEmail = `admin-audit-${project}@dev.invalid`
    await setClientPlan(adminEmail, "pro")
    await setClientPasswordHash(adminEmail, passwordHash)
    await setClientBusinessName(adminEmail, "OneFlyer Ops")
    await redis.set(`client:${adminEmail}:isAdmin`, true)
    created.push(`${adminEmail}  (pro, ADMIN)`)
  }

  // Stands in for a genuine customer, so the deletion tests can prove the
  // server REFUSES one. Never logged in as, so no limiter concern.
  const realEmail = "sarah@millerheatingandair.com"
  await setClientPlan(realEmail, "basic")
  await setClientPasswordHash(realEmail, passwordHash)
  await setClientBusinessName(realEmail, "Miller Heating & Air")
  created.push(`${realEmail}  (basic, stands in for a real customer)`)

  // Clear sign-in throttle buckets. Sign-in is rate-limited per account, and
  // repeated local test runs legitimately exhaust the window — after which
  // every browser test fails on a login timeout for a reason that has nothing
  // to do with what it asserts. These are ephemeral counters, never data, and
  // this only ever runs against the development database.
  let cursor = "0"
  let cleared = 0
  do {
    const [next, keys] = await redis.scan(cursor, { match: "ratelimit:*", count: 200 })
    cursor = next
    if (keys.length > 0) {
      await redis.del(...keys)
      cleared += keys.length
    }
  } while (cursor !== "0")
  if (cleared > 0) console.log(`Cleared ${cleared} sign-in throttle bucket(s).\n`)

  console.log(`Seeded ${created.length} development accounts:`)
  for (const line of created) console.log(`  ${line}`)
  console.log(`\nPassword for all of them: ${PASSWORD}  (development-only, never used anywhere else)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
