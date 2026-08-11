import { z } from "zod"
import { socialHandleEntrySchema } from "./shared"

export const FlyerRequestSchema = z.object({
  id: z.string(),
  purpose: z.string(),
  notes: z.string().nullable(),
})

export type FlyerRequest = z.infer<typeof FlyerRequestSchema>

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
})

export type FlyerSpecification = z.infer<typeof FlyerSpecificationSchema>

export const FlyerAgentOutputSchema = z.object({
  flyers: z.array(FlyerSpecificationSchema),
})

export type FlyerAgentOutput = z.infer<typeof FlyerAgentOutputSchema>

export const FlyerAgentInputSchema = z.object({
  brandProfile: z.any(), // BrandProfile — validated upstream by the Brand Agent
  contact: z.object({
    phone: z.string(),
    address: z.string(),
    website: z.string().nullable(),
    social: z.array(socialHandleEntrySchema()).nullable(),
  }),
  photos: z.array(z.object({ url: z.string(), caption: z.string() })),
  flyerRequests: z.array(FlyerRequestSchema),
  batchSize: z.number().max(10),
  revise: z
    .object({
      flyerId: z.string(),
      feedback: z.string(),
    })
    .optional(),
})

export type FlyerAgentInput = z.infer<typeof FlyerAgentInputSchema>
