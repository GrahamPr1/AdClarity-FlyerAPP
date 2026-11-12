/**
 * Forced-generation test for the centred-medallion redundancy rule
 * (prompts/flyer.ts, "Saying the same thing twice is not hierarchy").
 *
 *   npx tsx scripts/medallion-forced-test.ts <out-dir> [runs-per-case=2]
 *
 * Pins the REAL Flyer Agent to the centred-medallion archetype with no photo
 * (where the prompt tells it to lean on composition) and gives it a business
 * with several value propositions — the exact shape the rule's own example
 * warns about. Each result is checked in code by findRedundantDevices and
 * rendered to a PNG. Costs one Flyer Agent call per run (~$0.09).
 */
import "./load-env"
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"
import { runFlyerAgent } from "../lib/agent-pipeline/agents/flyerAgent"
import type { FlyerAgentInput } from "../lib/agent-pipeline/schemas/flyer"
import { LAYOUT_ARCHETYPES } from "../lib/agent-pipeline/design-variants"
import { formatForAgent } from "../lib/agent-pipeline/formats"
import { findRedundantDevices } from "../lib/agent-pipeline/redundancy"

const OUT = process.argv[2]
const RUNS = Number(process.argv[3] ?? 2)
if (!OUT) {
  console.error("usage: medallion-forced-test.ts <out-dir> [runs-per-case]")
  process.exit(2)
}

const medallion = LAYOUT_ARCHETYPES.find((a) => a.name === "centred-medallion")!

// Fixtures: invented businesses, plain facts only — no ratings, reviews or results.
const CASES: { name: string; input: Omit<FlyerAgentInput, "flyerRequests" | "batchSize" | "includeRepurposing">; purpose: string; notes: string }[] = [
  {
    name: "realtor",
    purpose: "Rural homes near Barren River Lake State Park",
    notes: "Privacy, room for recreation, and a place to call home. Rural properties, near the state park, personal guidance from a local agent.",
    input: {
      brandProfile: {
        businessName: "Taylor Welch Realty",
        targetAudience: ["Families looking for rural property"],
        positioning: "Local agent for rural homes around Barren River Lake.",
        brandVoice: ["warm", "plain-spoken"],
        colors: [
          { name: "primary", hex: "#1f3d2b", usage: "headers and backgrounds" },
          { name: "secondary", hex: "#f2efe6", usage: "supporting blocks" },
          { name: "accent", hex: "#c8902e", usage: "CTAs and highlights only" },
        ],
        fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
        approvedClaims: ["Rural properties", "Near Barren River Lake State Park", "Personal guidance from a local agent"],
        prohibitedClaims: ["No claims beyond approvedClaims"],
        requiredDisclaimers: [],
        colorSource: "client_provided",
        assumptionsMade: [],
      },
      hasLogo: false,
      contact: { phone: "270-555-0177", address: "Glasgow, KY", website: null, social: [] },
      photos: [],
    },
  },
  {
    // The most likely trigger: the client hands over a slogan that restates
    // their value propositions, and a medallion is the obvious place for it.
    name: "realtor-slogan",
    purpose: "Rural homes near Barren River Lake State Park",
    notes: "Our tagline is \"Privacy. Recreation. Home.\" Rural properties with privacy, recreation near the state park, and a home you'll love. Personal guidance from a local agent.",
    input: {
      brandProfile: {
        businessName: "Taylor Welch Realty",
        targetAudience: ["Families looking for rural property"],
        positioning: "Local agent for rural homes around Barren River Lake.",
        brandVoice: ["warm", "plain-spoken"],
        colors: [
          { name: "primary", hex: "#1f3d2b", usage: "headers and backgrounds" },
          { name: "secondary", hex: "#f2efe6", usage: "supporting blocks" },
          { name: "accent", hex: "#c8902e", usage: "CTAs and highlights only" },
        ],
        fonts: { heading: "Georgia, serif", body: "Georgia, serif" },
        approvedClaims: ["Privacy. Recreation. Home.", "Rural properties", "Near Barren River Lake State Park", "Personal guidance from a local agent"],
        prohibitedClaims: ["No claims beyond approvedClaims"],
        requiredDisclaimers: [],
        colorSource: "client_provided",
        assumptionsMade: [],
      },
      hasLogo: false,
      contact: { phone: "270-555-0177", address: "Glasgow, KY", website: null, social: [] },
      photos: [],
    },
  },
  {
    name: "hvac",
    purpose: "Fall furnace tune-up",
    notes: "$89 tune-up. Same-day service, licensed technicians, upfront pricing.",
    input: {
      brandProfile: {
        businessName: "Pearl Heating & Air",
        targetAudience: ["Homeowners"],
        positioning: "Local heating and cooling service.",
        brandVoice: ["direct", "friendly"],
        colors: [
          { name: "primary", hex: "#12314f", usage: "headers and backgrounds" },
          { name: "secondary", hex: "#eef1f4", usage: "supporting blocks" },
          { name: "accent", hex: "#e39a2b", usage: "CTAs and highlights only" },
        ],
        fonts: { heading: "'Helvetica Neue', Arial, sans-serif", body: "'Helvetica Neue', Arial, sans-serif" },
        approvedClaims: ["Same-day service", "Licensed technicians", "Upfront pricing"],
        prohibitedClaims: ["No claims beyond approvedClaims"],
        requiredDisclaimers: [],
        colorSource: "client_provided",
        assumptionsMade: [],
      },
      hasLogo: false,
      contact: { phone: "270-555-0142", address: "Bowling Green, KY", website: null, social: [] },
      photos: [],
    },
  },
]

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const jobs = CASES.flatMap((c) => Array.from({ length: RUNS }, (_, i) => ({ c, i })))
  const results = await Promise.all(
    jobs.map(async ({ c, i }) => {
      const id = `${c.name}-${i + 1}`
      const input: FlyerAgentInput = {
        ...c.input,
        flyerRequests: [
          {
            id,
            purpose: c.purpose,
            notes: c.notes,
            qrCodeDataUrl: null,
            format: formatForAgent("flyer"),
            designVariant: { layoutName: medallion.name, layoutBrief: medallion.brief, palette: null },
          },
        ],
        batchSize: 1,
        includeRepurposing: false,
      }
      try {
        const out = await runFlyerAgent(input, "medallion-test@local.test")
        const html = out.flyers[0].html
        fs.writeFileSync(path.join(OUT, `${id}.html`), html)
        return { id, html, redundant: findRedundantDevices(html) }
      } catch (err) {
        return { id, html: "", redundant: [], error: err instanceof Error ? err.message : String(err) }
      }
    }),
  )

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 850, height: 1100 } })
  for (const r of results) {
    if (!r.html) continue
    await page.setContent(r.html, { waitUntil: "load" })
    await page.screenshot({ path: path.join(OUT, `${r.id}.png`), clip: { x: 0, y: 0, width: 850, height: 1100 } })
  }
  await browser.close()

  for (const r of results) {
    console.log(`== ${r.id}${"error" in r && r.error ? ` FAILED: ${r.error}` : ""}`)
    for (const d of r.redundant) console.log(`   REDUNDANT: "${d.device}" — ${Math.round(d.share * 100)}% of its words repeat elsewhere (${d.repeatedIn.join(" | ")})`)
    if (!r.redundant.length && r.html) console.log("   no redundant device found")
  }
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results.map(({ html: _h, ...r }) => r), null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
