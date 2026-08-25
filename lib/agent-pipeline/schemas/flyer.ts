import { z } from "zod"
import { socialHandleEntrySchema } from "./shared"

export const FlyerRequestSchema = z.object({
  id: z.string(),
  purpose: z.string(),
  notes: z.string().nullable(),
})

export type FlyerRequest = z.infer<typeof FlyerRequestSchema>

// Same brand system, same headline/offer/CTA as the print flyer — reformatted
// per channel rather than independently reimagined, so a client's campaign
// reads as one coordinated push rather than disconnected pieces.
export const RepurposedContentSchema = z.object({
  instagramHtml: z.string(),
  instagramCaption: z.string(),
  textBlurb: z.string(),
  nextdoorPost: z.string(),
})

export type RepurposedContent = z.infer<typeof RepurposedContentSchema>

export const FlyerSpecificationSchema = z.object({
  id: z.string(),
  purpose: z.string(),
  dimensions: z.string(),
  headline: z.string(),
  subheadline: z.string().nullable(),
  offer: z.string().nullable(),
  cta: z.string(),
  disclaimer: z.string().nullable(),
  html: z.string(),
  paletteUsed: z.object({ primary: z.string(), secondary: z.string(), accent: z.string() }),
  fontsUsed: z.object({ heading: z.string(), body: z.string() }),
  notes: z.string(),
  /** Null when the client's plan doesn't include multi-channel repurposing (see includeRepurposing on FlyerAgentInputSchema) — Trial only, gated for real in the pipeline, not just hidden in the UI. */
  repurposed: RepurposedContentSchema.nullable(),
})

export type FlyerSpecification = z.infer<typeof FlyerSpecificationSchema>

export const FlyerAgentOutputSchema = z.object({
  flyers: z.array(FlyerSpecificationSchema),
})

export type FlyerAgentOutput = z.infer<typeof FlyerAgentOutputSchema>

// The agent's own input shape needs a qrCodeDataUrl per request that the
// stored/shared FlyerRequestSchema doesn't carry (it's generated fresh by
// the pipeline right before this call, not part of the Intake Agent's
// output or anything persisted — see qrTracking.ts). Null when the
// client's plan doesn't include QR tracking (Trial) — the pipeline simply
// doesn't generate a tracking code/QR image for those requests at all.
const FlyerRequestWithQrSchema = FlyerRequestSchema.extend({
  qrCodeDataUrl: z.string().nullable(),
  /**
   * The composition this specific flyer must use, assigned by the pipeline
   * (see design-variants.ts) rather than chosen by the agent. Decided in code
   * because a model asked to "vary the layout" cannot see the other flyers in
   * the batch, let alone ones from previous campaigns, and drifts back to the
   * same composition. `palette` is non-null only when the brand colours were
   * agent-invented and may therefore be swapped per flyer; when the client has
   * real brand colours it is null and brandProfile.colors governs.
   */
  designVariant: z.object({
    layoutName: z.string(),
    layoutBrief: z.string(),
    palette: z
      .object({ name: z.string(), primary: z.string(), secondary: z.string(), accent: z.string() })
      .nullable(),
  }),
})

export const FlyerAgentInputSchema = z.object({
  brandProfile: z.any(), // BrandProfile — validated upstream by the Brand Agent
  contact: z.object({
    phone: z.string(),
    /** Nullable — see the note on contact.address in schemas/intake.ts. The
     *  flyer simply omits the address line when there isn't one. */
    address: z.string().nullable(),
    website: z.string().nullable(),
    social: z.array(socialHandleEntrySchema()).nullable(),
  }),
  photos: z.array(z.object({ url: z.string(), caption: z.string() })),
  flyerRequests: z.array(FlyerRequestWithQrSchema),
  batchSize: z.number().max(10),
  /** Whole-batch flag — a batch is always one client's own plan. False on Trial; gates the Instagram/text/Nextdoor repurposed content for real, not just in the UI. */
  includeRepurposing: z.boolean(),
  revise: z
    .object({
      flyerId: z.string(),
      feedback: z.string(),
    })
    .optional(),
})

export type FlyerAgentInput = z.infer<typeof FlyerAgentInputSchema>
