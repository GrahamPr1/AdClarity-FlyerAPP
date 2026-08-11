import { z } from "zod"

// Structured Outputs cannot represent arbitrary-key objects (z.record) —
// every object must have a fixed, closed set of properties. Social handles
// are modeled as an array of pairs instead of Record<string,string>.
//
// This is a factory, not a shared constant: Anthropic's structured-output
// schema compiler rejects $defs (which zod emits whenever the same schema
// *instance* is referenced more than once) combined with a top-level union
// ("anyOf"). Calling this fresh at each usage site keeps every occurrence a
// distinct object so zod never detects — and hoists — a shared reference.
export function socialHandleEntrySchema() {
  return z.object({
    platform: z.string(),
    handle: z.string(),
  })
}

export type SocialHandleEntry = z.infer<ReturnType<typeof socialHandleEntrySchema>>
