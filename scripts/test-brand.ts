import "./load-env"
import { runBrandAgent } from "../lib/agent-pipeline/agents/brandAgent"
import type { NormalizedIntake } from "../lib/agent-pipeline/schemas/intake"

const intakeWithExistingColors: NormalizedIntake = {
  businessName: "Brightside Dental",
  industry: "Dentistry",
  yearsInBusiness: 12,
  services: ["Teeth cleaning", "Whitening", "Implants"],
  targetAudience: "Families in the local area",
  contact: {
    phone: "555-0192",
    address: "410 Oak St, Springfield",
    website: null,
    social: [{ platform: "instagram", handle: "@brightsidedental" }],
  },
  brandAssets: {
    logoUrl: null,
    existingColors: ["#2C6E63", "#F4E9DA"],
    existingFontsNote: null,
  },
  voiceTonePreference: "warm and reassuring",
  fontStylePreference: "modern",
  photos: [{ url: "https://example.com/photo1.jpg", caption: "front desk" }],
  wantsAiPhotos: false,
  flyerRequests: [
    { id: "f1", purpose: "New patient special", notes: "mention $50 off first cleaning" },
  ],
  websitePreferences: null,
  existingMaterialsNotes: "we have some old business cards",
  batchSize: 3,
}

const intakeWithoutColors: NormalizedIntake = {
  ...intakeWithExistingColors,
  businessName: "Quickfix Plumbing",
  industry: "Plumbing",
  yearsInBusiness: 5,
  services: ["Leak repair", "Drain cleaning", "Water heater installation"],
  targetAudience: "Homeowners needing fast, reliable repairs",
  voiceTonePreference: "professional",
  contact: {
    phone: "555-0110",
    address: "112 5th Ave, Springfield",
    website: null,
    social: null,
  },
  brandAssets: {
    logoUrl: null,
    existingColors: null,
    existingFontsNote: null,
  },
  flyerRequests: [{ id: "f1", purpose: "Emergency repair promo", notes: null }],
}

async function main() {
  console.log("--- Case 1: client-provided colors ---")
  const withColors = await runBrandAgent(intakeWithExistingColors, "hello@brightsidedental.example")
  console.log(JSON.stringify(withColors, null, 2))

  console.log("\n--- Case 2: no colors supplied (agent must propose) ---")
  const withoutColors = await runBrandAgent(intakeWithoutColors, "quickfix@example.com")
  console.log(JSON.stringify(withoutColors, null, 2))
}

main().catch((err) => {
  console.error("Brand Agent test failed:", err instanceof Error ? err.message : err)
  process.exit(1)
})
