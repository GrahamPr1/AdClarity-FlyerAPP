import "./load-env"
import { runIntakeAgent } from "../lib/agent-pipeline/agents/intakeAgent"
import type { IntakeSubmission } from "../lib/types"

// Real raw shape this project's onboarding-form.tsx actually submits — the
// point of this fixture is to exercise the field-shape mismatches the Intake
// Agent's prompt was extended to handle (services as {id,name}[], a single
// free-text socialHandles/brandColors/flyerNotes string, yearsInBusiness as
// a string), not the generic snake_case fixture from the standalone agent
// package.
const realFormSubmission: IntakeSubmission = {
  planId: "pro",
  businessName: "Brightside Dental",
  industry: "Dentistry",
  yearsInBusiness: "12",
  services: [
    { id: "svc-1", name: "Teeth cleaning" },
    { id: "svc-2", name: "Whitening" },
    { id: "svc-3", name: "Implants" },
  ],
  logoFileName: "brightside-logo.png",
  brandColors: "#0E7C7B, navy, gold",
  preferredStyle: "modern",
  voiceTone: "warm, reassuring",
  targetAudience: "Families in the local area looking for a reliable dentist",
  contact: {
    email: "hello@brightsidedental.example",
    phone: "555-0192",
    address: "410 Oak St, Springfield",
    website: "",
    socialHandles: "@brightsidedental",
  },
  existingMaterialsFileName: "old-business-cards.pdf",
  flyerNotes: "front desk sheet, new patient welcome packet, referral card mentioning $50 off first cleaning",
  websitePreferences: "Keep it simple, one page with services and contact info.",
}

const missingRequiredFields: IntakeSubmission = {
  planId: "free",
  businessName: "Quickfix Plumbing",
  industry: "",
  yearsInBusiness: "",
  services: [],
  brandColors: "",
  preferredStyle: "modern",
  voiceTone: "",
  targetAudience: "",
  contact: { email: "quickfix@example.com", phone: "", address: "112 5th Ave", website: "", socialHandles: "" },
  flyerNotes: "",
  websitePreferences: "",
}

async function main() {
  console.log("--- Case 1: real onboarding-form shape, complete ---")
  const complete = await runIntakeAgent(realFormSubmission)
  console.log(JSON.stringify(complete, null, 2))

  console.log("\n--- Case 2: missing required fields ---")
  const missing = await runIntakeAgent(missingRequiredFields)
  console.log(JSON.stringify(missing, null, 2))
}

main().catch((err) => {
  console.error("Intake Agent test failed:", err instanceof Error ? err.message : err)
  process.exit(1)
})
