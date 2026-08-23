import { z } from "zod"
import { socialHandleEntrySchema } from "./shared"

// Named NormalizedIntake (not IntakeSubmission) to avoid colliding with this
// project's own IntakeSubmission type in lib/types.ts, which is the raw
// onboarding-form shape — this is the Intake Agent's normalized OUTPUT shape,
// a distinct internal contract used only by the agent pipeline.
export const NormalizedIntakeSchema = z.object({
  businessName: z.string().min(1),
  industry: z.string().min(1),
  yearsInBusiness: z.number().nullable(),
  services: z.array(z.string()).min(1),
  targetAudience: z.string().min(1),
  contact: z.object({
    phone: z.string().min(1),
    /** Nullable since the first-campaign flow stopped asking for it — a flyer
     *  with a phone number is perfectly usable without a street address, and
     *  requiring one here blocked every new signup at the Intake Agent (it
     *  returned needs_clarification asking for an address the shortened
     *  onboarding no longer collects). Supplied later via /profile. */
    address: z.string().nullable(),
    website: z.string().nullable(),
    social: z.array(socialHandleEntrySchema()).nullable(),
    /** The person to contact, not the business itself — collected upfront on the website-scrape Path A form (see components/guided-setup-flow.tsx); never asked for on the manual guided flow, so null there. */
    contactName: z.string().nullable(),
  }),
  brandAssets: z.object({
    logoUrl: z.string().nullable(),
    existingColors: z.array(z.string()).nullable(),
    existingFontsNote: z.string().nullable(),
  }),
  voiceTonePreference: z.string().min(1),
  fontStylePreference: z.enum(["modern", "classic", "playful", "minimal"]),
  photos: z.array(z.object({ url: z.string(), caption: z.string() })),
  /** Verbatim copy of the raw submission's wantsAiPhotos — a real client consent choice, never inferred (see prompts/intake.ts). Defaults to false when absent. */
  wantsAiPhotos: z.boolean(),
  /** Verbatim copy of the raw submission's wantsQrCode — the client's own answer to "put a QR code on the flyer?", never inferred. Defaults to TRUE when absent (see the note in lib/types.ts). */
  wantsQrCode: z.boolean(),
  flyerRequests: z
    .array(
      z.object({
        id: z.string(),
        purpose: z.string().min(1),
        notes: z.string().nullable(),
      }),
    )
    .min(1),
  websitePreferences: z.string().nullable(),
  existingMaterialsNotes: z.string().nullable(),
  batchSize: z.number().max(10),
})

export type NormalizedIntake = z.infer<typeof NormalizedIntakeSchema>

// Not a z.union: Anthropic's structured-output schema compiler rejects a
// top-level "anyOf" (which a union produces) whenever the schema also
// contains $defs — and $defs shows up automatically for any schema with
// array fields, which every branch here has. Flattened into one object with
// a status discriminant instead; only the fields for the active branch are
// populated, the other branch's fields are null.
//
// partialData is a JSON-encoded string, not a fully-typed nullable mirror of
// NormalizedIntake: the API also caps total nullable/union-typed parameters
// per schema at 16 (exponential compilation cost past that), and a full
// all-nullable mirror alone burns through ~20. It's best-effort data anyway,
// so trading strict validation for one string field is a reasonable cost —
// callers JSON.parse() it for display.
export const IntakeAgentOutputSchema = z.object({
  status: z.enum(["complete", "needs_clarification"]),
  data: NormalizedIntakeSchema.nullable(),
  normalizationNotes: z.array(z.string()).nullable(),
  missingFields: z.array(z.string()).nullable(),
  clarifyingQuestions: z.array(z.string()).nullable(),
  partialData: z.string().nullable(),
})

export type IntakeAgentOutput = z.infer<typeof IntakeAgentOutputSchema>
