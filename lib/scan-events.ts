import type { BusinessProfile } from "@/lib/business-profile"

/**
 * The wire format between the scanner route and the AI Control Center.
 *
 * Shared so the server cannot emit a step the client does not understand,
 * and so "what the AI is doing" has exactly one definition.
 *
 * `status` is deliberately four-valued. A boolean tick/not-tick forces the UI
 * to lie about the common case where an operation genuinely ran and genuinely
 * found nothing: no logo on the page is not a failure and is not a success,
 * it is "skipped", and the Control Center says so rather than showing a tick
 * next to a thing that did not happen.
 */
export type ScanStepStatus = "running" | "done" | "skipped" | "failed"

export type ScanStepId =
  | "connect"
  | "pages"
  | "extract"
  | "logo"
  | "colors"
  | "services"
  | "contact"
  | "save"

export type ScanEvent =
  | {
      type: "step"
      id: ScanStepId
      status: ScanStepStatus
      label: string
      detail?: string
    }
  | {
      type: "complete"
      profile: BusinessProfile
      scannedPages: string[]
      logoReason: string | null
    }
  | { type: "error"; reason: string; message: string }

/** The steps in the order the scanner performs them, for rendering the panel
 *  before any event has arrived. Nothing is shown as complete here. */
export const SCAN_STEP_ORDER: { id: ScanStepId; label: string }[] = [
  { id: "connect", label: "Connect to website" },
  { id: "pages", label: "Discover and read pages" },
  { id: "extract", label: "Read business information" },
  { id: "logo", label: "Detect logo" },
  { id: "colors", label: "Detect brand colors" },
  { id: "services", label: "Identify services" },
  { id: "contact", label: "Find contact information" },
  { id: "save", label: "Save business profile" },
]

/** Parses an NDJSON stream into events. Tolerates partial chunks — a line
 *  split across two network reads must not be dropped or double-parsed. */
export function createNdjsonParser(onEvent: (e: ScanEvent) => void) {
  let buffer = ""
  return {
    push(chunk: string) {
      buffer += chunk
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          onEvent(JSON.parse(trimmed) as ScanEvent)
        } catch {
          // A malformed line is dropped rather than killing the stream; the
          // steps it would have updated stay in their previous state, which
          // is honest — we genuinely don't know what happened.
        }
      }
    },
    flush() {
      const trimmed = buffer.trim()
      buffer = ""
      if (!trimmed) return
      try {
        onEvent(JSON.parse(trimmed) as ScanEvent)
      } catch {
        /* same reasoning as above */
      }
    },
  }
}
