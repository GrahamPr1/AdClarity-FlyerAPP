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

/** Claude has no browsing tool here — a client-provided info link is fetched server-side, never handed to the agent as a bare URL. Returns null on any fetch failure rather than throwing; a bad link just means less context, not a failed request. */
async function fetchInfoLinkContent(infoLink: string | null): Promise<string | null> {
  if (!infoLink) return null
  try {
    const res = await fetch(infoLink, { redirect: "follow" })
    if (!res.ok) return null
    const raw = await res.text()
    const contentType = res.headers.get("content-type") ?? ""
    const text = contentType.includes("html") ? stripHtml(raw) : raw
    return text.slice(0, MAX_LINK_FETCH_CHARS)
  } catch {
    return null
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

  const infoLinkContent = await fetchInfoLinkContent(infoLink)

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
