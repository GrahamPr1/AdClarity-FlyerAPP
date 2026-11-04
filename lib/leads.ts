import { z } from "zod"

// Validation and limits for the offer-page lead form, shared by the route
// (app/api/leads/[code]/route.ts), the form (components/lead-form.tsx) and
// the tests.

/** Five a window is plenty for a person who mistyped their number. */
export const LEAD_RATE_LIMIT = 5
export const LEAD_RATE_WINDOW_SECONDS = 60 * 60

/** Per-field maximums. The form uses them as maxLength; the server enforces them. */
export const LEAD_LIMITS = { name: 100, phone: 30, email: 200, message: 1000 } as const

/** Digits with the punctuation people actually type. 7 to 15 digits (E.164's ceiling). */
const PHONE = /^[0-9+().\-\s]+$/
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

export const LeadSchema = z.object({
  name: z.string().trim().min(1, "Add your name.").max(LEAD_LIMITS.name, "That name is too long."),
  phone: z
    .string()
    .trim()
    .max(LEAD_LIMITS.phone, "That phone number is too long.")
    .refine((v) => PHONE.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15, "Add a phone number we can call."),
  email: z
    .union([z.literal(""), z.string().trim().email("That doesn't look like an email address.").max(LEAD_LIMITS.email)])
    .optional()
    .transform((v) => (v ? v : null)),
  message: optionalText(LEAD_LIMITS.message),
})
