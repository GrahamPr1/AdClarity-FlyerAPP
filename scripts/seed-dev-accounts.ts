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
import { setClientPlan, setClientPasswordHash, assertRedisMatchesEnvironment } from "../lib/store"
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

  console.log(`Seeded ${created.length} development accounts:`)
  for (const line of created) console.log(`  ${line}`)
  console.log(`\nPassword for all of them: ${PASSWORD}  (development-only, never used anywhere else)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
