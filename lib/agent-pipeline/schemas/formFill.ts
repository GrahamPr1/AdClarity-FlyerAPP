import { z } from "zod"

// One real AcroForm field extracted from the target PDF via pdf-lib —
// passed to the agent as context, not filled in by it. `options` is only
// populated for choice fields (checkbox/radio/dropdown export values).
export const FormFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["text", "checkbox", "radio", "dropdown", "other"]),
  options: z.array(z.string()).nullable(),
})

export type FormField = z.infer<typeof FormFieldSchema>

export const FormFillAgentInputSchema = z.object({
  fields: z.array(FormFieldSchema),
  // The actual fetched text content of the client's info link, not just the
  // URL — Claude has no browsing tool here, so the link is fetched
  // server-side before this ever reaches the agent (see formFillPipeline.ts).
  // Null if no link was given, or it couldn't be fetched.
  infoLinkContent: z.string().nullable(),
})

export type FormFillAgentInput = z.infer<typeof FormFillAgentInputSchema>

// One field's value, exactly as it should be written into the PDF —
// checkbox/radio/dropdown values MUST be one of that field's real export
// options (never invented), enforced by the prompt, not the schema (a
// dependent per-field enum isn't expressible in Structured Outputs).
export const FormFieldValueSchema = z.object({
  name: z.string(),
  value: z.string(),
})

export const FormFillAgentOutputSchema = z.object({
  fields: z.array(FormFieldValueSchema),
  // Anything the agent couldn't confidently fill from the provided info —
  // surfaced to the client rather than guessed.
  unfilledNotes: z.array(z.string()).nullable(),
})

export type FormFillAgentOutput = z.infer<typeof FormFillAgentOutputSchema>
