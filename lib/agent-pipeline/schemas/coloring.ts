import { z } from "zod"

/**
 * A printable black-and-white coloring page.
 *
 * Deliberately NOT a flyer variant. The audience (teachers, parents, and
 * businesses white-labelling a mascot) has nothing in common with the
 * home-services market the flyer pipeline serves, and the output is line art
 * rather than a designed document — no brand palette, no offer, no call to
 * action, no QR code.
 */
export const ColoringPageRequestSchema = z.object({
  /** What the page should depict, in the requester's own words. */
  subject: z.string().min(1),
  /** Rough age band — drives how detailed the line work should be. */
  audience: z.enum(["toddler", "young-child", "older-child", "adult"]),
  /** Optional theme or occasion, e.g. "Halloween", "Earth Day", "back to school". */
  theme: z.string().nullable(),
  /** Optional caption printed above the art, e.g. "Mrs. Patel's Class". */
  caption: z.string().nullable(),
})

export type ColoringPageRequest = z.infer<typeof ColoringPageRequestSchema>

export const ColoringPageSchema = z.object({
  /** Short human title for the dashboard, e.g. "Rainy Day Classroom". */
  title: z.string(),
  /** One line describing what's in the scene — shown to the requester, not printed. */
  description: z.string(),
  /**
   * A complete standalone HTML document containing the line art as inline
   * SVG. SVG rather than a raster image because line art IS vector work:
   * strokes stay crisp at any print size, and there is no photo or fill to
   * accidentally produce.
   */
  html: z.string(),
})

export type ColoringPage = z.infer<typeof ColoringPageSchema>

export const ColoringAgentOutputSchema = z.object({
  page: ColoringPageSchema,
})

export type ColoringAgentOutput = z.infer<typeof ColoringAgentOutputSchema>
