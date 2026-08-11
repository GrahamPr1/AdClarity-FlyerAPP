import { z } from "zod"

export const BrandProfileSchema = z.object({
  businessName: z.string(),
  targetAudience: z.array(z.string()),
  positioning: z.string(),
  brandVoice: z.array(z.string()),
  colors: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      usage: z.string(),
    }),
  ),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
  }),
  approvedClaims: z.array(z.string()),
  prohibitedClaims: z.array(z.string()),
  requiredDisclaimers: z.array(z.string()),
  colorSource: z.enum(["client_provided", "agent_proposed"]),
  assumptionsMade: z.array(z.string()),
})

export type BrandProfile = z.infer<typeof BrandProfileSchema>
