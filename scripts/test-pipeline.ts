import "./load-env"
import { runIntakeAgent } from "../lib/agent-pipeline/agents/intakeAgent"
import { runBrandAgent } from "../lib/agent-pipeline/agents/brandAgent"
import { runFlyerAgent } from "../lib/agent-pipeline/agents/flyerAgent"
import type { IntakeSubmission } from "../lib/types"
import { assignDesignVariants } from "../lib/agent-pipeline/design-variants"
import { formatForAgent } from "../lib/agent-pipeline/formats"

// Same real onboarding-form shape as scripts/test-intake.ts's complete case.
const realFormSubmission: IntakeSubmission = {
  planId: "pro",
  businessCategory: "Dental",
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

async function main() {
  console.log("--- Full pipeline: real onboarding-form shape -> Intake -> Brand -> Flyer ---")

  const { planId, submittedAt, ...rawPayload } = realFormSubmission
  const email = realFormSubmission.contact.email
  const intakeResult = await runIntakeAgent(rawPayload, email)

  if (intakeResult.status === "needs_clarification") {
    console.log(
      JSON.stringify(
        { stoppedAt: "intake", missingFields: intakeResult.missingFields, clarifyingQuestions: intakeResult.clarifyingQuestions },
        null,
        2,
      ),
    )
    return
  }

  const intake = intakeResult.data!
  console.log("\n--- Intake output ---")
  console.log(JSON.stringify(intakeResult, null, 2))

  const brandProfile = await runBrandAgent(intake, email)
  console.log("\n--- Brand output ---")
  console.log(JSON.stringify(brandProfile, null, 2))

  const placeholderQrCodeDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  const flyers = await runFlyerAgent({
    brandProfile,
    contact: intake.contact,
    photos: intake.photos,
    flyerRequests: (() => {
      const variants = assignDesignVariants(intake.flyerRequests.map((r) => r.id), true)
      return intake.flyerRequests.map((r) => ({ ...r, qrCodeDataUrl: placeholderQrCodeDataUrl, format: formatForAgent(undefined), designVariant: variants.get(r.id)! }))
    })(),
    batchSize: intake.flyerRequests.length,
    includeRepurposing: true,
  }, email)
  console.log("\n--- Flyer output ---")
  console.log(JSON.stringify(flyers, null, 2))
}

main().catch((err) => {
  console.error("Pipeline test failed:", err instanceof Error ? err.message : err)
  process.exit(1)
})
