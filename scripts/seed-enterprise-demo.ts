/**
 * Seeds the fictional Northstar Mutual org behind the internal enterprise demo.
 *
 *   npm run seed:enterprise-demo
 *
 * Safe by construction, the same way seed:dev is: it refuses to run unless the
 * connected database is marked `development`, so it can never write fixtures
 * into production. The agent's address uses the reserved `.invalid` TLD, which
 * can never resolve or receive mail.
 *
 * Idempotent — fixed ids, so re-running updates in place rather than piling up
 * duplicate assets under the org.
 *
 * EVERY WORD HERE IS INVENTED. Northstar Mutual is not a real carrier and
 * these are not a real compliance team's approved strings. That matters more
 * than it sounds: the demo's whole claim is that output traces to approved
 * content, so a reviewer must never be shown a piece that looks like it came
 * from a real carrier's library. See docs/enterprise-pilot-readiness.md for
 * why no real library should run through this path yet.
 */
import "./load-env"
import {
  saveEnterpriseOrg,
  createContentAsset,
  saveAgentProfile,
  listContentAssets,
  setClientPlan,
  setClientPasswordHash,
  setClientBusinessName,
  assertRedisMatchesEnvironment,
} from "../lib/store"
import { hashPassword } from "../lib/auth"
import { getAppEnvironment } from "../lib/env"

export const DEMO_ORG_ID = "northstar-mutual-demo"
export const DEMO_AGENT_EMAIL = "dana@northstar.invalid"
const DEMO_PASSWORD = "DevTest!2345"

/**
 * Two assets, chosen to exercise both sides of the lock distinction:
 *
 *   - A LOCKED disclosure, which must survive character for character. It
 *     deliberately contains "guarantees" and "not a recommendation to buy" —
 *     the words the invented-compliance check scans for — so the demo proves
 *     the check can tell approved text from invented text rather than just
 *     flagging any sentence that sounds regulatory.
 *   - An UNLOCKED product sheet whose one substantive line is HEDGED
 *     ("Options include..."). That hedge is what generation tends to drop when
 *     it reformats the line into bullets, which is pilot-readiness item 1 and
 *     the reason the Sources panel separates exact from adapted.
 */
const ASSETS = [
  {
    id: "demo-asset-disclosure-2026",
    sourceLabel: "Compliance Disclosure 2026",
    locked: true,
    content:
      "Guarantees are backed solely by the claims-paying ability of Northstar Mutual. This material is for educational purposes only and is not a recommendation to buy any product.",
  },
  {
    id: "demo-asset-product-sheet-v3",
    sourceLabel: "Retirement Income Product Sheet v3",
    locked: false,
    content:
      "Northstar Mutual's retirement income solutions are designed for people within ten years of retiring. Options include guaranteed lifetime income, flexible withdrawal schedules, and spousal continuation.",
  },
] as const

async function main() {
  const env = getAppEnvironment()
  if (env !== "development") {
    throw new Error(
      `seed:enterprise-demo refuses to run in "${env}" — it only ever seeds the local development database.`,
    )
  }
  // Belt and braces: also verify the DATABASE says it's development, not just
  // this process. A misconfigured URL is exactly the failure this catches.
  await assertRedisMatchesEnvironment()

  await saveEnterpriseOrg({ id: DEMO_ORG_ID, name: "Northstar Mutual (demo)", assets: [] })

  for (const a of ASSETS) {
    await createContentAsset({
      id: a.id,
      orgId: DEMO_ORG_ID,
      assetType: "text",
      sourceLabel: a.sourceLabel,
      locked: a.locked,
      content: a.content,
    })
  }

  // The client record the demo generates as. Enterprise mode triggers off
  // AgentProfile -> orgId -> an org with assets, so all three must exist.
  await setClientPlan(DEMO_AGENT_EMAIL, "pro")
  await setClientPasswordHash(DEMO_AGENT_EMAIL, await hashPassword(DEMO_PASSWORD))
  await setClientBusinessName(DEMO_AGENT_EMAIL, "Dana Reyes, Northstar Mutual")

  await saveAgentProfile(DEMO_AGENT_EMAIL, {
    name: "Dana Reyes",
    title: "Retirement Income Specialist",
    phone: "555-0142",
    email: DEMO_AGENT_EMAIL,
    headshotUrl: null,
    licenseStates: ["KY", "TN"],
    qrDestination: "https://example.invalid/northstar-demo-rsvp",
    orgId: DEMO_ORG_ID,
  })

  const seeded = await listContentAssets(DEMO_ORG_ID)
  console.log(`Seeded org ${DEMO_ORG_ID} with ${seeded.length} asset(s):`)
  for (const a of seeded) {
    console.log(`  - ${a.sourceLabel} [${a.locked ? "locked" : "unlocked"}]`)
  }
  console.log(`Agent: ${DEMO_AGENT_EMAIL}`)
  console.log(`Demo route: /admin/enterprise-demo`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
