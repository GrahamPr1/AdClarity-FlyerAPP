// Real image generation via Higgsfield's REST API — used to fill the gap the
// old {{AI_PHOTO:...}} token mechanism left broken (see prompts/flyer.ts):
// that mechanism promised a placeholder would get "resolved to a real URL"
// but nothing ever did it. This module IS that resolution step, done before
// the Flyer Agent runs — a real URL goes into `photos` and the agent uses it
// exactly like a client-supplied photo. No token, nothing to leave broken.
//
// API reference (platform.higgsfield.ai) confirmed from docs.higgsfield.ai:
//   POST   https://platform.higgsfield.ai/{model_id}
//   Header Authorization: Key {HF_API_KEY}:{HF_API_SECRET}
//   Body   { prompt, aspect_ratio, resolution }
//   ->     { status: "queued"|"in_progress"|"completed"|"failed"|"nsfw",
//            request_id, status_url, cancel_url, images?: [{url}] }
//   GET    https://platform.higgsfield.ai/requests/{request_id}/status
//
// Model: nano_banana_2 at 1K resolution — Higgsfield's own CLI uses this as
// its canonical low-cost example, and third-party pricing writeups place it
// at the cheapest end of their image lineup. NOTE: the exact credit cost per
// image is NOT reliably confirmed — public docs don't publish a pricing
// table, and secondhand blog figures disagree with each other by 10-20x.
// This module logs whatever cost field the API response actually contains;
// if it contains none, that's logged explicitly rather than guessed. Get an
// authoritative number via `higgsfield generate cost nano_banana_2 --prompt
// "..."` (once `higgsfield auth login` is done) or the Higgsfield dashboard.

const API_BASE = "https://platform.higgsfield.ai"
const MODEL_ID = "nano_banana_2"
const RESOLUTION = "1K" // cheapest tier — matches the "least credits" ask
const POLL_INTERVAL_MS = 1500
const MAX_WAIT_MS = 30_000

interface HiggsfieldJobResponse {
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw"
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
    console.log(`[higgsfield] ${context}: ${credits} credits used (model=${MODEL_ID}, resolution=${RESOLUTION})`)
  } else {
    console.log(
      `[higgsfield] ${context}: completed, but response reported no credits/cost field — check the Higgsfield dashboard or 'higgsfield generate cost ${MODEL_ID} --prompt "..."' for the authoritative figure.`,
    )
  }
}

/**
 * Generates one image via Higgsfield. Never throws — returns null on any
 * failure (missing credentials, network error, non-2xx response, NSFW
 * rejection, or timeout) so callers can fall back to the CSS-only design
 * rather than ship a broken image reference.
 */
export async function generateImage(opts: { prompt: string; context: string }): Promise<GeneratedImage | null> {
  const authHeader = getAuthHeader()
  if (!authHeader) {
    console.log(`[higgsfield] ${opts.context}: skipped — HF_API_KEY/HF_API_SECRET not configured.`)
    return null
  }

  try {
    const submitRes = await fetch(`${API_BASE}/${MODEL_ID}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        aspect_ratio: "4:3",
        resolution: RESOLUTION,
      }),
    })

    if (!submitRes.ok) {
      console.log(`[higgsfield] ${opts.context}: submit failed with HTTP ${submitRes.status} — falling back to CSS-only design.`)
      return null
    }

    let job: HiggsfieldJobResponse = await submitRes.json()

    const deadline = Date.now() + MAX_WAIT_MS
    while (job.status === "queued" || job.status === "in_progress") {
      if (Date.now() > deadline) {
        console.log(`[higgsfield] ${opts.context}: timed out after ${MAX_WAIT_MS}ms — falling back to CSS-only design.`)
        return null
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      const statusRes = await fetch(`${API_BASE}/requests/${job.request_id}/status`, {
        headers: { Authorization: authHeader },
      })
      if (!statusRes.ok) {
        console.log(`[higgsfield] ${opts.context}: status check failed with HTTP ${statusRes.status} — falling back to CSS-only design.`)
        return null
      }
      job = await statusRes.json()
    }

    if (job.status !== "completed" || !job.images?.[0]?.url) {
      console.log(`[higgsfield] ${opts.context}: ended with status "${job.status}" — falling back to CSS-only design.`)
      return null
    }

    logCost(opts.context, job)
    return { url: job.images[0].url, creditsUsed: extractCredits(job) }
  } catch (err) {
    console.log(
      `[higgsfield] ${opts.context}: request failed (${err instanceof Error ? err.message : err}) — falling back to CSS-only design.`,
    )
    return null
  }
}
