import { put } from "@vercel/blob"
import { extractFormFields, fillFormFields } from "./pdfForm"
import { runFormFillAgent } from "./agents/formFillAgent"
import { updateFormFillRequest } from "@/lib/store"
import type { DocumentInput } from "./client"

// Same timeout/Failed-state safety as the flyer pipeline (see pipeline.ts) —
// no request should be able to sit "In Progress" forever.
const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS) || 2 * 60 * 1000
const MAX_LINK_FETCH_CHARS = 200_000 // cap how much of a linked page's text we read

class PipelineTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PipelineTimeoutError(`Generation timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

function describeFailure(err: unknown): string {
  if (err instanceof PipelineTimeoutError) return err.message
  return `Fill failed: ${err instanceof Error ? err.message : "unknown error"}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const GOOGLE_SHEETS_URL_RE = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/

/** A Google Sheets URL has no readable content via a plain fetch (it's a JS app shell) — converts it to that sheet's public CSV export endpoint instead, which works with no login IF the sheet is shared as "Anyone with the link can view". Preserves a specific tab's gid if the URL included one. */
function toGoogleSheetsCsvExportUrl(url: string): string | null {
  const match = url.match(GOOGLE_SHEETS_URL_RE)
  if (!match) return null
  const gidMatch = url.match(/[#&?]gid=(\d+)/)
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gidMatch ? `&gid=${gidMatch[1]}` : ""}`
}

/**
 * Claude has no browsing tool here — a client-provided info link is
 * fetched server-side, never handed to the agent as a bare URL.
 *
 * A Google Sheets link gets special handling: converted to its CSV export
 * URL, and a failure there is treated as a real, surfaceable error (most
 * likely cause: the sheet isn't actually shared publicly) rather than
 * silently degraded — Google doesn't return a clean 401 for this, it
 * redirects to an HTML sign-in page with a 200, so content-type is the
 * real signal a fetch succeeded vs. quietly failed.
 *
 * Any other link failing is NOT treated as an error — a bad generic link
 * just means less context for the agent, not a failed request.
 */
async function fetchInfoLinkContent(infoLink: string | null): Promise<{ content: string | null; error: string | null }> {
  if (!infoLink) return { content: null, error: null }

  const sheetsExportUrl = toGoogleSheetsCsvExportUrl(infoLink)

  try {
    const res = await fetch(sheetsExportUrl ?? infoLink, { redirect: "follow" })
    const contentType = res.headers.get("content-type") ?? ""

    if (sheetsExportUrl) {
      if (!res.ok || !contentType.includes("csv")) {
        return {
          content: null,
          error: 'Couldn\'t access that Google Sheet — make sure it\'s shared as "Anyone with the link can view", then try again.',
        }
      }
      return { content: await res.text(), error: null }
    }

    if (!res.ok) return { content: null, error: null }
    const raw = await res.text()
    const text = contentType.includes("html") ? stripHtml(raw) : raw
    return { content: text.slice(0, MAX_LINK_FETCH_CHARS), error: null }
  } catch {
    return {
      content: null,
      error: sheetsExportUrl ? "Couldn't reach that Google Sheet link — please check it and try again." : null,
    }
  }
}

async function uploadFilledPdf(email: string, requestId: string, bytes: Uint8Array): Promise<string> {
  // Private — these are completed personal/business forms, never meant to
  // be reachable by anyone who guesses or leaks the URL. Read back only
  // through /api/form-fill/download, which enforces the session check
  // Blob's own URL doesn't.
  const blob = await put(`form-fills/${email}/${requestId}.pdf`, Buffer.from(bytes), {
    access: "private",
    contentType: "application/pdf",
    addRandomSuffix: false,
  })
  return blob.url
}

async function runFill(
  targetFormBytes: Uint8Array,
  infoFile: { bytes: Uint8Array; mediaType: DocumentInput["mediaType"] } | null,
  infoLink: string | null,
): Promise<{ filledBytes: Uint8Array; unfilledNotes: string[] | null }> {
  const fields = await extractFormFields(targetFormBytes)
  if (fields.length === 0) {
    throw new Error("This PDF has no fillable form fields — only fillable PDF forms are supported right now.")
  }

  const { content: infoLinkContent, error: linkError } = await fetchInfoLinkContent(infoLink)
  if (linkError) {
    // A Google Sheet that isn't actually reachable is a real, fixable
    // problem worth surfacing — but only fail the whole request if it was
    // the client's ONLY information source; if they also gave a file,
    // just proceed with that instead of blocking on the broken link.
    if (!infoFile) throw new Error(linkError)
    console.error("[form-fill] Info link failed, continuing with infoFile only:", linkError)
  }

  const targetFormDoc: DocumentInput = { base64: Buffer.from(targetFormBytes).toString("base64"), mediaType: "application/pdf" }
  const infoFileDoc: DocumentInput | null = infoFile
    ? { base64: Buffer.from(infoFile.bytes).toString("base64"), mediaType: infoFile.mediaType }
    : null

  const agentOutput = await runFormFillAgent({ fields, infoLinkContent }, targetFormDoc, infoFileDoc)
  const filledBytes = await fillFormFields(targetFormBytes, agentOutput.fields)
  return { filledBytes, unfilledNotes: agentOutput.unfilledNotes }
}

/**
 * Runs the whole form-fill request and updates its stored status as it
 * goes. Intended to be called via waitUntil() from its route, same
 * reasoning as the flyer pipeline's continuePipelineFromIntake.
 */
export async function processFormFill(
  email: string,
  requestId: string,
  targetFormBytes: Uint8Array,
  infoFile: { bytes: Uint8Array; mediaType: DocumentInput["mediaType"] } | null,
  infoLink: string | null,
): Promise<void> {
  try {
    await updateFormFillRequest(email, requestId, { status: "In Progress" })

    const { filledBytes, unfilledNotes } = await withTimeout(runFill(targetFormBytes, infoFile, infoLink), PIPELINE_TIMEOUT_MS)
    const resultUrl = await uploadFilledPdf(email, requestId, filledBytes)

    await updateFormFillRequest(email, requestId, {
      status: "Ready",
      resultUrl,
      unfilledNotes: unfilledNotes ?? undefined,
    })
  } catch (err) {
    const reason = describeFailure(err)
    console.error("[form-fill] Failed:", reason)
    await updateFormFillRequest(email, requestId, { status: "Failed", error: reason }).catch((e) =>
      console.error("[form-fill] Failed to record failure:", e),
    )
  }
}
