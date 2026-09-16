/**
 * Round-trips every enterprise schema helper against a REAL Redis, and
 * re-checks that the SMB reads Brief 1 must not disturb still work.
 *
 *   npm run dev:redis   (in another shell)
 *   npx tsx scripts/verify-enterprise-schema.ts
 *
 * Lives here rather than in the vitest suite because lib/store.ts constructs
 * its Redis client at import time — round-trip assertions need a live
 * connection, which the pure unit suite deliberately doesn't have.
 */
import "./load-env"
import {
  saveEnterpriseOrg, getEnterpriseOrg, createContentAsset, getContentAsset,
  listContentAssets, deleteContentAsset, saveAgentProfile, getAgentProfile, campaignSources,
  getCampaignDefaults, getBusinessProfile, getSavedBrandProfile, getDeliverablesForEmail,
} from "../lib/store"

let failures = 0
const ok = (label: string, cond: boolean) => {
  if (!cond) failures++
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`)
}

async function main() {
  const ORG = `verify-org-${Date.now()}`
  console.log("\n--- enterpriseOrg + contentAsset CRUD ---")
  await saveEnterpriseOrg({ id: ORG, name: "Northstar Mutual (fictional)", assets: [] })
  ok("org created and read back", (await getEnterpriseOrg(ORG))?.name === "Northstar Mutual (fictional)")

  const sheet = await createContentAsset({ orgId: ORG, assetType: "text",
    sourceLabel: "Carrier Product Sheet v3", locked: false, content: "Coverage options for retirees." })
  const disclosure = await createContentAsset({ orgId: ORG, assetType: "text",
    sourceLabel: "Compliance Disclosure 2026", locked: true,
    content: "Guarantees are backed by the claims-paying ability of the issuer." })

  ok("asset gets an id + createdAt", !!sheet.id && !!sheet.createdAt)
  ok("asset read back by id, locked preserved", (await getContentAsset(disclosure.id))?.locked === true)

  const listed = await listContentAssets(ORG)
  ok("list returns both assets", listed.length === 2)
  ok("newest first", listed[0].id === disclosure.id)
  ok("org index updated", (await getEnterpriseOrg(ORG))!.assets.length === 2)
  ok("unknown org lists empty rather than throwing", (await listContentAssets("no-such-org")).length === 0)

  await deleteContentAsset(sheet.id)
  ok("delete removes the asset AND its index entry",
    (await getContentAsset(sheet.id)) === null && (await listContentAssets(ORG)).length === 1)

  console.log("\n--- agentProfile ---")
  const EMAIL = `verify-agent-${Date.now()}@dev.invalid`
  await saveAgentProfile(EMAIL, { name: "Dana Reyes", title: "Retirement Specialist", phone: "555-0142",
    email: EMAIL, headshotUrl: null, licenseStates: ["KY", "TN"],
    qrDestination: "https://example.invalid/dana", orgId: ORG })
  const ap = await getAgentProfile(EMAIL)
  ok("agent profile round-trips", ap?.name === "Dana Reyes" && ap.licenseStates.join() === "KY,TN")
  ok("absent agent profile is null", (await getAgentProfile("nobody@dev.invalid")) === null)

  console.log("\n--- SMB behaviour unchanged ---")
  const E = "sarah@millerheatingandair.com"
  const d = await getDeliverablesForEmail(E)
  ok("deliverables still readable", Array.isArray(d.flyers))
  ok("no existing flyer gained a sources field", d.flyers.every((f) => !("sources" in f)))
  ok("campaignDefaults still readable", (await getCampaignDefaults(E)) !== undefined)
  ok("business-profile still readable", (await getBusinessProfile(E)) !== undefined)
  ok("brand-profile still readable", (await getSavedBrandProfile(E)) !== undefined)
  ok("campaignSources normalises absent to []", campaignSources({ sources: undefined }).length === 0)

  console.log(failures === 0 ? "\n  ALL PASS" : `\n  ${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
main()
