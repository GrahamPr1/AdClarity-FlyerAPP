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
  repurposed: RepurposedContentSchema,
})

export type FlyerSpecification = z.infer<typeof FlyerSpecificationSchema>

export const FlyerAgentOutputSchema = z.object({
  flyers: z.array(FlyerSpecificationSchema),
})

export type FlyerAgentOutput = z.infer<typeof FlyerAgentOutputSchema>

// The agent's own input shape needs a qrCodeDataUrl per request that the
// stored/shared FlyerRequestSchema doesn't carry (it's generated fresh by
// the pipeline right before this call, not part of the Intake Agent's
// output or anything persisted — see qrTracking.ts).
const FlyerRequestWithQrSchema = FlyerRequestSchema.extend({
  qrCodeDataUrl: z.string(),
})

export const FlyerAgentInputSchema = z.object({
  brandProfile: z.any(), // BrandProfile — validated upstream by the Brand Agent
  contact: z.object({
    phone: z.string(),
    address: z.string(),
    website: z.string().nullable(),
    social: z.array(socialHandleEntrySchema()).nullable(),
  }),
  photos: z.array(z.object({ url: z.string(), caption: z.string() })),
  flyerRequests: z.array(FlyerRequestWithQrSchema),
  batchSize: z.number().max(10),
  revise: z
    .object({
      flyerId: z.string(),
      feedback: z.string(),
    })
    .optional(),
})

export type FlyerAgentInput = z.infer<typeof FlyerAgentInputSchema>
