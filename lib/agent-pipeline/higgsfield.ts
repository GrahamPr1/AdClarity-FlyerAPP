// Real image generation via Higgsfield's REST API — used to fill the gap the
// old {{AI_PHOTO:...}} token mechanism left broken (see prompts/flyer.ts):
// that mechanism promised a placeholder would get "resolved to a real URL"
// but nothing ever did it. This module IS that resolution step, done before
// the Flyer Agent runs — a real URL goes into `photos` and the agent uses it
// exactly like a client-supplied photo. No token, nothing to leave broken.
//
// API reference (docs.higgsfield.ai, checked 2026-10-23):
//   POST   https://api.higgsfield.ai/z-image/turbo
//   Header Authorization: Key {HF_API_KEY}:{HF_API_SECRET}
//          Idempotency-Key: <uuid>   (a retried submit can't bill twice)
//   Body   { prompt (1–800 chars), resolution: "1k"|"2k", aspect_ratio, prompt_extend }
//   ->     { status: "queued"|"in_progress"|"completed"|"failed"|"nsfw"|"canceled",
//            request_id, status_url, cancel_url, images?: [{url}] }
//   GET    status_url  (https://api.higgsfield.ai/requests/{request_id}/status)
//
// History: this used to POST https://platform.higgsfield.ai/z_image — the
// legacy host (being retired; Higgsfield's cutoff is 2026-10-31) and the
// CLI's job_type name for the model. That started returning 404 ("request
// or model not found for this account"), and every AI-photo flyer silently
// went without a photo. The current endpoint ID is "z-image/turbo".
//
// Cost: Z-Image Turbo at 1k with prompt_extend off is Higgsfield's cheapest
// image tier (~$0.015/image) — the same model this always targeted, chosen
// because the Pro tier this once hit by mistake cost ~13x as much.

const API_BASE = "https://api.higgsfield.ai"
const API_HOST = new URL(API_BASE).host
export const MODEL_ID = "z-image/turbo"
export const MAX_PROMPT_CHARS = 800
const POLL_INTERVAL_MS = 1500
const MAX_WAIT_MS = 30_000

interface HiggsfieldJobResponse {
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled"
  request_id: string
  status_url?: string
  images?: { url: string }[]
  // Field name for credit cost isn't confirmed in public docs — check every
  // plausible key so real cost gets logged whenever the API reports one.
  credits_used?: number
  credits?: number
  cost?: number
}

export interface GeneratedImage {
  url: string
  creditsUsed: number | null
}

export type GenerationFailure =
  | "not_configured"
  | "prompt_too_long"
  | "submit_rejected"
  | "status_check_failed"
  | "timed_out"
  | "unsuccessful"
  | "network_error"

export type GenerationResult = ({ ok: true } & GeneratedImage) | { ok: false; reason: GenerationFailure; detail: string }

function getAuthHeader(): string | null {
  const key = process.env.HF_API_KEY
  const secret = process.env.HF_API_SECRET
  if (!key || !secret) return null
  return `Key ${key}:${secret}`
}

function extractCredits(job: HiggsfieldJobResponse): number | null {
  return job.credits_used ?? job.credits ?? job.cost ?? null
}

function logCost(context: string, job: HiggsfieldJobResponse) {
  const credits = extractCredits(job)
  if (credits !== null) {
    console.log(`[higgsfield] ${context}: ${credits} credits used (model=${MODEL_ID})`)
  } else {
    console.log(`[higgsfield] ${context}: completed (model=${MODEL_ID}); response reported no cost field — see the Higgsfield console for the charge.`)
  }
}

/** HTTP status plus the API's own `detail` message, if it sent one — never the request. */
async function describeHttpFailure(res: Response): Promise<string> {
  let detail = ""
  try {
    const body: unknown = await res.json()
    if (body && typeof body === "object" && "detail" in body) detail = JSON.stringify((body as { detail: unknown }).detail).slice(0, 200)
  } catch {
    // Non-JSON error body — the status code is the useful part.
  }
  const hint =
    res.status === 401 ? " (check HF_API_KEY/HF_API_SECRET)"
    : res.status === 403 ? " (insufficient Higgsfield credits)"
    : res.status === 404 ? ` (endpoint or model "${MODEL_ID}" not available to this account — check docs.higgsfield.ai)`
    : res.status === 422 ? " (request rejected as invalid — check the model's input schema)"
    : ""
  return `HTTP ${res.status}${hint}${detail ? `: ${detail}` : ""}`
}

/**
 * Where to poll: the status_url the API returned (its docs say to use it
 * rather than build one), but only on Higgsfield's own API host — the
 * Authorization header goes with that request, so it must never be sent to
 * a host taken from a response body.
 */
function statusUrlFor(job: HiggsfieldJobResponse): string {
  if (job.status_url) {
    try {
      const u = new URL(job.status_url)
      if (u.protocol === "https:" && u.host === API_HOST) return u.href
    } catch {
      // fall through to the documented pattern
    }
  }
  return `${API_BASE}/requests/${encodeURIComponent(job.request_id)}/status`
}

/**
 * Generates one image via Higgsfield. Never throws — every failure comes back
 * as a reason plus detail (and is logged as one `[higgsfield] FAILED` line),
 * so the caller can fall back to a stock photo or the CSS-only design rather
 * than ship a broken image reference, and a broken integration shows up in
 * the logs instead of as flyers that quietly lack photos.
 */
export async function generateImage(opts: { prompt: string; context: string }): Promise<GenerationResult> {
  const fail = (reason: GenerationFailure, detail: string): GenerationResult => {
    console.error(`[higgsfield] FAILED ${opts.context}: ${reason} — ${detail}`)
    return { ok: false, reason, detail }
  }

  const authHeader = getAuthHeader()
  if (!authHeader) return fail("not_configured", "HF_API_KEY/HF_API_SECRET not set")
  const prompt = opts.prompt.trim()
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return fail("prompt_too_long", `${prompt.length} chars (allowed 1–${MAX_PROMPT_CHARS})`)

  try {
    const submitRes = await fetch(`${API_BASE}/${MODEL_ID}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ prompt, resolution: "1k", aspect_ratio: "4:3", prompt_extend: false }),
    })
    if (!submitRes.ok) return fail("submit_rejected", await describeHttpFailure(submitRes))

    let job: HiggsfieldJobResponse = await submitRes.json()
    const statusUrl = statusUrlFor(job)

    const deadline = Date.now() + MAX_WAIT_MS
    while (job.status === "queued" || job.status === "in_progress") {
      if (Date.now() > deadline) return fail("timed_out", `still ${job.status} after ${MAX_WAIT_MS}ms (request ${job.request_id})`)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      const statusRes = await fetch(statusUrl, { headers: { Authorization: authHeader } })
      if (!statusRes.ok) return fail("status_check_failed", await describeHttpFailure(statusRes))
      job = await statusRes.json()
    }

    if (job.status !== "completed" || !job.images?.[0]?.url) {
      return fail("unsuccessful", `ended with status "${job.status}"${job.status === "completed" ? " but no image URL" : ""} (request ${job.request_id})`)
    }

    logCost(opts.context, job)
    return { ok: true, url: job.images[0].url, creditsUsed: extractCredits(job) }
  } catch (err) {
    return fail("network_error", err instanceof Error ? err.message : String(err))
  }
}
