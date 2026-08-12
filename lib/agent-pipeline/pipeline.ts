import type { IntakeSubmission } from "@/lib/types"
import { markAllFlyersInProgress, markFlyerFailed, markPendingFlyersFailed, savePipelineState, seedFlyerDeliverables, updateDeliverable } from "@/lib/store"
import { runIntakeAgent } from "./agents/intakeAgent"
import { runBrandAgent } from "./agents/brandAgent"
import { runFlyerAgent } from "./agents/flyerAgent"
import { generateImage } from "./higgsfield"
import type { IntakeAgentOutput, NormalizedIntake } from "./schemas/intake"
import type { FlyerRequest } from "./schemas/flyer"

export const MAX_FLYERS_PER_BATCH = 10

// No flyer should be able to sit "In Progress" forever — if the serverless
// function generating it gets frozen/reclaimed mid-run, or a real error
// hangs instead of rejecting promptly, this ceiling forces a Failed state
// instead of a silent stall. Overridable via env var so tests don't have to
// wait out the real ceiling.
const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS) || 2 * 60 * 1000

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
  return `Generation failed: ${err instanceof Error ? err.message : "unknown error"}`
}

/**
 * Strips billing/plan-selection fields the agents have no use for and passes
 * everything else through in the site's own raw shape — the Intake Agent's
 * prompt is written to normalize exactly this shape (services as
 * {id,name}[], socialHandles/brandColors/flyerNotes as free-text strings,
 * yearsInBusiness as a string, etc). No structural adaptation happens here;
 * that normalization work stays inside the Intake Agent per design.
 */
function buildRawIntakePayload(submission: IntakeSubmission) {
  const { planId, submittedAt, ...rest } = submission
  return rest
}

function toDataUrl(html: string): string {
  const base64 = Buffer.from(html, "utf-8").toString("base64")
  return `data:text/html;charset=utf-8;base64,${base64}`
}

/**
 * Fills the photo gap the old {{AI_PHOTO:...}} tokens left broken: if the
 * client supplied zero photos of their own, generate one real image per
 * flyer request via Higgsfield (least-credits approach — exactly one
 * attempt per flyer, no retries, skipped entirely if no client photos are
 * missing or Higgsfield isn't configured). Failures are per-image and never
 * throw — the Flyer Agent's existing CSS-only design already handles a
 * flyer with no matching photo gracefully, so a partial (or total) miss
 * here just means fewer real photos in the pool, not a broken flyer.
 */
async function buildPhotoPool(intake: NormalizedIntake, flyerRequests: FlyerRequest[]) {
  if (intake.photos.length > 0) return intake.photos

  const results = await Promise.allSettled(
    flyerRequests.map((request) =>
      generateImage({
        context: `flyer "${request.purpose}"`,
        prompt: `${intake.industry}, ${request.purpose}, professional environment, warm natural lighting, no people, no text, no logos, documentary style`,
      }),
    ),
  )

  return results
    .map((result, i) => (result.status === "fulfilled" && result.value ? { image: result.value, purpose: flyerRequests[i].purpose } : null))
    .filter((entry): entry is { image: { url: string; creditsUsed: number | null }; purpose: string } => entry !== null)
    .map(({ image, purpose }) => ({
      url: image.url,
      caption: `AI-generated, illustrative — suggested for: ${purpose}`,
    }))
}

/**
 * Runs just the Intake stage — awaited synchronously by /api/intake so the
 * route knows the real flyerRequests count before deciding whether the
 * free-tier limit allows this submission to proceed. Cheap relative to
 * Brand+Flyer, so awaiting it doesn't meaningfully change response latency
 * for the common case, but it does mean the response is no longer
 * near-instant — a deliberate tradeoff, since the limit decision genuinely
 * depends on this stage's output.
 */
export async function runIntakeStage(submission: IntakeSubmission): Promise<IntakeAgentOutput> {
  const rawPayload = buildRawIntakePayload(submission)
  return runIntakeAgent(rawPayload)
}

async function runBatch(email: string, intake: NormalizedIntake, flyerRequests: FlyerRequest[]): Promise<void> {
  const brandProfile = await runBrandAgent(intake)
  const photos = await buildPhotoPool(intake, flyerRequests)

  const flyerResult = await runFlyerAgent({
    brandProfile,
    contact: intake.contact,
    photos,
    flyerRequests,
    batchSize: flyerRequests.length,
  })

  for (const flyer of flyerResult.flyers) {
    await updateDeliverable(email, {
      type: "flyer",
      id: flyer.id,
      status: "Ready",
      downloadUrl: toDataUrl(flyer.html),
    })
  }
}

/**
 * Runs Brand -> Flyer for an already-normalized intake and updates
 * deliverable state as each stage completes, using the same update contract
 * the /api/agent-callback webhook exposes (see lib/store.ts's
 * updateDeliverable). Intended to be called via waitUntil() from
 * /api/intake so the response doesn't have to wait on it, but the
 * serverless function is kept alive until it actually finishes — AFTER the
 * caller has already checked the usage limit and incremented
 * flyersCreated.
 *
 * email is the submitter's email from the ORIGINAL raw submission, not the
 * normalized intake — the Intake Agent's output has no email field (it's
 * irrelevant to brand/flyer design), so deliverable storage, which is now
 * keyed per-client by email, needs it passed through separately.
 */
export async function continuePipelineFromIntake(email: string, intake: NormalizedIntake, flyerRequests: FlyerRequest[]): Promise<void> {
  // Saved before generation starts (not after) so a retry has something to
  // work with even if this very attempt is what fails.
  await savePipelineState(email, intake, flyerRequests)

  try {
    await seedFlyerDeliverables(email, flyerRequests.map((r) => ({ id: r.id, purpose: r.purpose })))
    await markAllFlyersInProgress(email)

    await withTimeout(runBatch(email, intake, flyerRequests), PIPELINE_TIMEOUT_MS)
  } catch (err) {
    const reason = describeFailure(err)
    console.error("[agent-pipeline] Pipeline failed:", reason)
    await markPendingFlyersFailed(email, reason).catch((e) => console.error("[agent-pipeline] Failed to record failure:", e))
  }
}

async function runSingleFlyerRetry(email: string, intake: NormalizedIntake, flyerRequest: FlyerRequest): Promise<void> {
  const brandProfile = await runBrandAgent(intake)
  const photos = await buildPhotoPool(intake, [flyerRequest])

  const flyerResult = await runFlyerAgent({
    brandProfile,
    contact: intake.contact,
    photos,
    flyerRequests: [flyerRequest],
    batchSize: 1,
  })

  const flyer = flyerResult.flyers[0]
  if (!flyer) throw new Error("Flyer Agent returned no result")

  await updateDeliverable(email, {
    type: "flyer",
    id: flyer.id,
    status: "Ready",
    downloadUrl: toDataUrl(flyer.html),
  })
}

/**
 * Regenerates ONE flyer from previously-saved pipeline state — used to
 * retry a Failed (or stuck) flyer without re-running the Intake Agent.
 * Brand is recomputed fresh rather than cached from the original attempt:
 * simpler, and it's one cheap call, so the small recompute cost isn't worth
 * persisting brand profile state for. Intended to be run via waitUntil()
 * from its route, same reasoning as continuePipelineFromIntake.
 */
export async function retryFlyer(email: string, intake: NormalizedIntake, flyerRequest: FlyerRequest): Promise<void> {
  await updateDeliverable(email, { type: "flyer", id: flyerRequest.id, status: "In Progress" })

  try {
    await withTimeout(runSingleFlyerRetry(email, intake, flyerRequest), PIPELINE_TIMEOUT_MS)
  } catch (err) {
    const reason = describeFailure(err)
    console.error("[agent-pipeline] Retry failed:", reason)
    await markFlyerFailed(email, flyerRequest.id, reason).catch((e) => console.error("[agent-pipeline] Failed to record retry failure:", e))
  }
}
