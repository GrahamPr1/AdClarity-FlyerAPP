/**
 * Puts a local account on a plan, for testing entitlements end to end.
 *
 *   npm run set-plan -- someone@example.com pro
 *
 * Development only, and guarded the same way seed:dev is — this grants real
 * server-side entitlements (50 flyers/month and AI-generated photos on Pro),
 * and there is no billing behind any of it, so it must never be pointed at
 * production. Use /admin/users there instead, where the change is attributable
 * to an admin session.
 *
 * Does NOT create the account or touch its password. The email has to be one
 * that can already sign in; this only moves the plan.
 */
import "./load-env"
import { getClient, setClientPlan, assertRedisMatchesEnvironment } from "../lib/store"
import { getAppEnvironment } from "../lib/env"
import { PLAN_LIMITS, type PlanId } from "../lib/types"

const PLAN_IDS = Object.keys(PLAN_LIMITS) as PlanId[]

async function main() {
  const env = getAppEnvironment()
  if (env !== "development") {
    throw new Error(`set-plan refuses to run in "${env}" — use /admin/users on a real deployment.`)
  }
  await assertRedisMatchesEnvironment()

  const email = process.argv[2]?.trim().toLowerCase()
  const plan = process.argv[3]?.trim() as PlanId | undefined

  if (!email || !plan || !PLAN_IDS.includes(plan)) {
    throw new Error(`Usage: npm run set-plan -- <email> <${PLAN_IDS.join("|")}>`)
  }

  const existing = await getClient(email)
  if (!existing) {
    // Silently creating one would produce an account that can't sign in,
    // which looks like the plan change failed rather than the account missing.
    throw new Error(`No client record for ${email}. Sign up through the app first, then re-run this.`)
  }

  const before = existing.plan ?? "(none)"
  const client = await setClientPlan(email, plan)
  console.log(`${email}: ${before} -> ${client.plan}  (${PLAN_LIMITS[plan]} flyers/month)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
