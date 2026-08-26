/**
 * Wall-clock profile of the real generation pipeline.
 *
 * Every call here hits the real model — the point is measurement, not
 * simulation, so this costs real tokens. Run against the DEV environment.
 *
 *   npx tsx scripts/profile-pipeline.ts
 */
import "./load-env"
import { runIntakeAgent } from "../lib/agent-pipeline/agents/intakeAgent"
import { runBrandAgent } from "../lib/agent-pipeline/agents/brandAgent"
import { runFlyerAgent } from "../lib/agent-pipeline/agents/flyerAgent"
import { runRepurposeAgent } from "../lib/agent-pipeline/agents/repurposeAgent"
import { crawlWebsite } from "../lib/agent-pipeline/scraper"
import { assignDesignVariants } from "../lib/agent-pipeline/design-variants"
import { canonicalOfferFrom } from "../lib/agent-pipeline/flyer-html"
import type { NormalizedIntake } from "../lib/agent-pipeline/schemas/intake"

const EMAIL = "profile@dev.invalid"

const RAW_SUBMISSION = {
  businessName: "Miller Heating & Air",
  industry: "Residential HVAC",
  yearsInBusiness: "27",
  services: [
    { id: "1", name: "Furnace repair" },
    { id: "2", name: "AC installation" },
    { id: "3", name: "Duct cleaning" },
  ],
  preferredStyle: "modern",
  voiceTone: "direct, reassuring",
  targetAudience: "Homeowners in Denver with aging furnaces",
  contact: { email: EMAIL, phone: "(303) 555-7788", address: "", website: "", socialHandles: "" },
  flyerNotes: "$500 off a new furnace this month, free inspection, financing available",
  websitePreferences: "",
  wantsAiPhotos: false,
  wantsQrCode: true,
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = Date.now()
  const value = await fn()
  const ms = Date.now() - t0
  console.log(`  ${label.padEnd(42)} ${String(ms).padStart(7)} ms`)
  return { ms, value }
}

function bar(ms: number, total: number) {
  const pct = total ? Math.round((ms / total) * 100) : 0
  return `${String(pct).padStart(3)}%  ${"█".repeat(Math.max(1, Math.round(pct / 2)))}`
}

async function main() {
  console.log(`\nmodel: ${process.env.ADCLARITY_MODEL ?? "claude-sonnet-5"} (all agents)\n`)
  console.log("── SEQUENTIAL PIPELINE, single flyer ──────────────────────────")

  const intake = await timed("1. Intake agent", () => runIntakeAgent(RAW_SUBMISSION, EMAIL))
  if (!intake.value.data) throw new Error("Intake returned no data: " + JSON.stringify(intake.value.missingFields))
  const normalized: NormalizedIntake = intake.value.data

  const brand = await timed("2. Brand agent", () => runBrandAgent(normalized, EMAIL))

  const oneVariant = assignDesignVariants([normalized.flyerRequests[0].id], brand.value.colorSource === "agent_proposed")
  const flyer1 = await timed("3. Flyer agent (batch of 1)", () =>
    runFlyerAgent(
      {
        brandProfile: brand.value,
        contact: normalized.contact,
        photos: [],
        flyerRequests: [{ ...normalized.flyerRequests[0], qrCodeDataUrl: null, designVariant: oneVariant.get(normalized.flyerRequests[0].id)! }],
        batchSize: 1,
        includeRepurposing: false,
      },
      EMAIL,
    ),
  )

  const repurpose = await timed("4. Repurpose agent (1 flyer)", () =>
    runRepurposeAgent(
      { brandProfile: brand.value, contact: normalized.contact, flyer: canonicalOfferFrom(flyer1.value.flyers[0]) },
      EMAIL,
    ),
  )

  const total = intake.ms + brand.ms + flyer1.ms + repurpose.ms
  console.log(`\n  ${"TOTAL (what a client waits for)".padEnd(42)} ${String(total).padStart(7)} ms  (${(total / 1000).toFixed(1)}s)\n`)
  console.log("  share of total:")
  console.log(`    Intake     ${bar(intake.ms, total)}`)
  console.log(`    Brand      ${bar(brand.ms, total)}`)
  console.log(`    Flyer      ${bar(flyer1.ms, total)}`)
  console.log(`    Repurpose  ${bar(repurpose.ms, total)}`)

  // ---- batch behaviour --------------------------------------------------
  console.log("\n── BATCH OF 3 ─────────────────────────────────────────────────")
  const threeIds = ["p-a", "p-b", "p-c"]
  const requests = threeIds.map((id, i) => ({
    id,
    purpose: ["$500 off a new furnace", "Free duct inspection", "Winter tune-up special"][i],
    notes: null,
  }))
  const variants = assignDesignVariants(threeIds, brand.value.colorSource === "agent_proposed")

  const batched = await timed("3 flyers in ONE call (current behaviour)", () =>
    runFlyerAgent(
      {
        brandProfile: brand.value,
        contact: normalized.contact,
        photos: [],
        flyerRequests: requests.map((r) => ({ ...r, qrCodeDataUrl: null, designVariant: variants.get(r.id)! })),
        batchSize: 3,
        includeRepurposing: false,
      },
      EMAIL,
    ),
  )

  const parallel = await timed("3 flyers as 3 CONCURRENT calls", async () =>
    Promise.all(
      requests.map((r) =>
        runFlyerAgent(
          {
            brandProfile: brand.value,
            contact: normalized.contact,
            photos: [],
            flyerRequests: [{ ...r, qrCodeDataUrl: null, designVariant: variants.get(r.id)! }],
            batchSize: 1,
            includeRepurposing: false,
          },
          EMAIL,
        ),
      ),
    ),
  )
  console.log(`\n  batched produced ${batched.value.flyers.length} flyers, concurrent produced ${parallel.value.length}`)
  const delta = batched.ms - parallel.ms
  console.log(`  difference: ${delta > 0 ? "concurrent is FASTER by" : "batched is FASTER by"} ${Math.abs(delta)} ms (${(Math.abs(delta) / 1000).toFixed(1)}s)`)

  // ---- scraper ----------------------------------------------------------
  console.log("\n── WEBSITE SCRAPE (relevant to the competitor-research idea) ──")
  await timed("crawlWebsite(example.com)", () => crawlWebsite("https://example.com"))

  console.log("\n── AI PHOTO GENERATION ────────────────────────────────────────")
  console.log(`  HIGGSFIELD configured: ${!!process.env.HIGGSFIELD_API_KEY}`)
  console.log("  (Pro + explicit opt-in only; skipped entirely otherwise — see buildPhotoPool)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
