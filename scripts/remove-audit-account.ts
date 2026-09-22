/**
 * Removes the dev-only account the contrast-audit tooling provisioned.
 *
 *   npm run remove-audit-account -- a11y-audit@local.test
 *
 * Development only, and guarded the same way seed:dev and
 * provision-dev-account are — plus a second check that the DATABASE itself
 * says "development", because this deletes keys and a misconfigured URL is
 * exactly the failure that guard exists to catch.
 *
 * Scoped to `client:<email>:*` for ONE email passed explicitly. It scans and
 * PRINTS every key it matched before deleting anything, so the deletion is
 * reviewable rather than taken on trust.
 */
import "./load-env"
import { Redis } from "@upstash/redis"
import { assertRedisMatchesEnvironment } from "../lib/store"
import { getAppEnvironment } from "../lib/env"

async function main() {
  const env = getAppEnvironment()
  if (env !== "development") {
    throw new Error(`remove-audit-account refuses to run in "${env}" — it deletes keys.`)
  }
  await assertRedisMatchesEnvironment()

  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || !email.includes("@")) {
    throw new Error("Usage: npm run remove-audit-account -- <email>")
  }
  // Refuse anything that isn't obviously a local test address, so a typo
  // can't turn this into a tool for deleting a real account.
  if (!/\.(test|invalid|local)$/.test(email) && !email.endsWith("@local.test")) {
    throw new Error(`"${email}" is not a local test address (.test/.invalid/.local). Refusing.`)
  }

  const redis = Redis.fromEnv()
  let cursor = "0"
  const keys: string[] = []
  do {
    const [next, batch] = await redis.scan(cursor, { match: `client:${email}:*`, count: 100 })
    cursor = next
    keys.push(...batch)
  } while (cursor !== "0")

  if (keys.length === 0) {
    console.log(`No keys found for ${email} — nothing to remove.`)
    return
  }

  console.log(`Keys matched for ${email}:`)
  for (const k of keys) console.log(`  ${k}`)
  await redis.del(...keys)
  console.log(`\nDeleted ${keys.length} key(s).`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
