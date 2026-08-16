import "./load-env"
import { runFlyerAgent } from "../lib/agent-pipeline/agents/flyerAgent"
import type { BrandProfile } from "../lib/agent-pipeline/schemas/brand"
import type { FlyerAgentInput } from "../lib/agent-pipeline/schemas/flyer"

const brightsideDentalBrandProfile: BrandProfile = {
  businessName: "Brightside Dental",
  targetAudience: ["Local families", "Adults seeking routine dental care"],
  positioning: "Brightside Dental gives Springfield families reliable, welcoming dental care close to home.",
  brandVoice: ["warm", "reassuring", "plain-spoken"],
  colors: [
    { name: "primary", hex: "#2C6E63", usage: "headers and backgrounds" },
    { name: "secondary", hex: "#F4E9DA", usage: "supporting blocks and cards" },
    { name: "accent", hex: "#E08E45", usage: "CTAs and highlights only" },
  ],
  fonts: { heading: "Poppins", body: "Inter" },
  approvedClaims: [
    "Over 12 years serving Springfield families",
    "Offering teeth cleaning, whitening, and implants",
  ],
  prohibitedClaims: [
    "No fabricated awards or certifications",
    "No guaranteed health outcomes",
    "No disparaging comparisons to named competitors",
    "No claims beyond approvedClaims",
  ],
  requiredDisclaimers: [
    "Offer valid for new patients only; expires 30 days from receipt. See office for details.",
  ],
  colorSource: "client_provided",
  assumptionsMade: [],
}

const brightsideFlyerInput: FlyerAgentInput = {
  brandProfile: brightsideDentalBrandProfile,
  contact: {
    phone: "555-0192",
    address: "410 Oak St, Springfield",
    website: null,
    social: [{ platform: "instagram", handle: "@brightsidedental" }],
  },
  photos: [{ url: "https://example.com/photo1.jpg", caption: "front desk" }],
  flyerRequests: [
    { id: "f1", purpose: "New patient special", notes: "mention $50 off first cleaning", qrCodeDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" },
  ],
  batchSize: 1,
  includeRepurposing: true,
}

async function main() {
  console.log("--- Case 1: single flyer from a brand-locked profile ---")
  const result = await runFlyerAgent(brightsideFlyerInput, "hello@brightsidedental.example")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error("Flyer Agent test failed:", err instanceof Error ? err.message : err)
  process.exit(1)
})
