/**
 * Provisions a sign-in-able account in the LOCAL development database.
 *
 *   ACCOUNT_PASSWORD='…' npm run provision-account -- someone@example.com pro
 *
 * Exists because set-plan.ts deliberately refuses to create accounts — it only
 * moves an existing one between tiers — and signing up through the UI every
 * time you need a test account at a given plan is friction without purpose.
 *
 * Development only, guarded the same way seed:dev is, and for a stronger
 * reason than usual: this writes a password hash. Pointing it at production
 * would mean provisioning a real credential on a real deployment from a
 * developer's laptop, with no admin session and no audit trail. Use the signup
 * flow and /admin/users there.
 *
 * The password is read from ACCOUNT_PASSWORD rather than argv so it does not
 * sit in shell history or process listings, and it is never logged — not on
 * success, not in errors. Hashed with the same hashPassword the signup route
 * uses, so the account is indistinguishable from a real one at sign-in.
 *
 * Idempotent: re-running resets the password and plan for an existing account
 * rather than erroring.
 */
import "./load-env"
import { getClient, setClientPlan, setClientPasswordHash, assertRedisMatchesEnvironment } from "../lib/store"
import { hashPassword } from "../lib/auth"
import { getAppEnvironment } from "../lib/env"
import { PLAN_LIMITS, type PlanId } from "../lib/types"

const PLAN_IDS = Object.keys(PLAN_LIMITS) as PlanId[]

async function main() {
  const env = getAppEnvironment()
  if (env !== "development") {
    throw new Error(`provision-account refuses to run in "${env}" — it writes a password hash.`)
  }
  await assertRedisMatchesEnvironment()

  const email = process.argv[2]?.trim().toLowerCase()
  const plan = (process.argv[3]?.trim() || "trial") as PlanId
  const password = process.env.ACCOUNT_PASSWORD

  if (!email || !email.includes("@")) {
    throw new Error(`Usage: ACCOUNT_PASSWORD='…' npm run provision-account -- <email> <${PLAN_IDS.join("|")}>`)
  }
  if (!PLAN_IDS.includes(plan)) {
    throw new Error(`Unknown plan "${plan}". One of: ${PLAN_IDS.join(", ")}`)
  }
  if (!password) {
    throw new Error("ACCOUNT_PASSWORD is not set. Pass it in the environment, not as an argument.")
  }

  const existed = (await getClient(email)) !== null

  await setClientPasswordHash(email, await hashPassword(password))
  const client = await setClientPlan(email, plan)

  console.log(`${existed ? "Updated" : "Created"} ${email}`)
  console.log(`  plan     : ${client.plan}  (${PLAN_LIMITS[plan]} flyers/month)`)
  console.log(`  password : set (not shown)`)
  console.log(`  admin    : ${client.isAdmin ? "yes" : "no"}`)
}

main().catch((err) => {
  // Deliberately message-only — an unhandled throw here would print the whole
  // process env, ACCOUNT_PASSWORD included, in some runners.
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
