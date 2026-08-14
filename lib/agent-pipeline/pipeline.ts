import type { IntakeSubmission } from "@/lib/types"
import { markFlyersInProgress, markFlyerFailed, markFlyersFailed, savePipelineState, seedFlyerDeliverables, updateDeliverable, getClient } from "@/lib/store"
import { runIntakeAgent } from "./agents/intakeAgent"
import { runBrandAgent } from "./agents/brandAgent"
import { runFlyerAgent } from "./agents/flyerAgent"
import { generateImage } from "./higgsfield"
import { createFlyerTrackingCode, backfillTrackingContent } from "./qrTracking"
import type { IntakeAgentOutput, NormalizedIntake } from "./schemas/intake"
import type { FlyerRequest } from "./schemas/flyer"

// QR tracking, multi-channel repurposing, and AI-generated photos are all
// real, server-side-gated features — never just hidden in the UI. Checked
// against the CLIENT's real enforcement plan (never the marketing-page
// selection — see the note on PlanId in lib/types.ts), same source of
// truth as the usage-limit check in /api/intake. Fetched once per
// batch/retry so both checks reflect the same plan snapshot.
async function getPlanFeatures(email: string): Promise<{ includeExtras: boolean; allowAiPhotos: boolean }> {
  const client = await getClient(email)
  return {
    includeExtras: client?.plan !== "trial", // Basic+/Pro: QR tracking, repurposing
    allowAiPhotos: client?.plan === "pro", // Pro only — also requires the client's own opt-in (see buildPhotoPool)
  }
}

export const MAX_FLYERS_PER_BATCH = 10

// No flyer should be able to sit "In Progress" forever — if the serverless
// function generating it gets frozen/reclaimed mid-run, or a real error
// hangs instead of rejecting promptly, this ceiling forces a Failed state
// instead of a silent stall. Overridable via env var so tests don't have to
// wait out the real ceiling.
//
// Bumped from 2 to 4 minutes when repurposed per-channel content (a second
// full HTML document plus captions per flyer) roughly doubled real
// generation output — stays comfortably under Vercel's 300s function limit.
const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS) || 4 * 60 * 1000

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

// Packs in real, specific business context (not just industry) so the
// generated image reads as belonging to THIS business's actual site and
// service rather than a generic stock photo — the flyer's own purpose/notes,
// the real services offered, and who it's for.
function buildAiPhotoPrompt(intake: NormalizedIntake, request: FlyerRequest): string {
  const services = intake.services.slice(0, 3).join(", ")
  const noteContext = request.notes ? ` — ${request.notes}` : ""
  return (
    `${intake.industry} business, ${request.purpose}${noteContext}, ` +
    `offering ${services}, for an audience of ${intake.targetAudience}, ` +
    `professional environment, warm natural lighting, no people, no text, no logos, documentary style`
  )
}

/**
 * Fills the photo gap the old {{AI_PHOTO:...}} tokens left broken: if the
 * client supplied zero photos of their own, generate one real image per
 * flyer request via Higgsfield — but ONLY when allowAiGeneration is true
 * (Pro plan AND the client's own explicit opt-in, see intake.wantsAiPhotos
 * — never automatic). Least-credits approach — exactly one attempt per
 * flyer, no retries, skipped entirely if Higgsfield isn't configured.
 * Failures are per-image and never throw — the Flyer Agent's existing
 * CSS-only design already handles a flyer with no matching photo
 * gracefully, so a partial (or total) miss here just means fewer real
 * photos in the pool, not a broken flyer.
 */
async function buildPhotoPool(intake: NormalizedIntake, flyerRequests: FlyerRequest[], allowAiGeneration: boolean) {
  if (intake.photos.length > 0) return intake.photos
  if (!allowAiGeneration) return []

  const results = await Promise.allSettled(
    flyerRequests.map((request) =>
      generateImage({
        context: `flyer "${request.purpose}"`,
        prompt: buildAiPhotoPrompt(intake, request),
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
  const { includeExtras, allowAiPhotos } = await getPlanFeatures(email)
  const photos = await buildPhotoPool(intake, flyerRequests, allowAiPhotos && intake.wantsAiPhotos)

  // One tracking code + QR image per flyer, generated before the agent call
  // — it needs a real, ready image to embed, the same way it needs real
  // photo URLs (see buildPhotoPool). Skipped entirely on Trial: no tracking
  // record, no QR, nothing to embed. The code -> flyerId mapping lets the
  // backfill step below match each agent response back to its own record.
  const trackingByFlyerId = new Map(
    includeExtras
      ? await Promise.all(flyerRequests.map(async (r) => [r.id, await createFlyerTrackingCode(email, r.id, intake)] as const))
      : [],
  )
  const flyerRequestsWithQr = flyerRequests.map((r) => ({ ...r, qrCodeDataUrl: trackingByFlyerId.get(r.id)?.qrDataUrl ?? null }))

  const flyerResult = await runFlyerAgent({
    brandProfile,
    contact: intake.contact,
    photos,
    flyerRequests: flyerRequestsWithQr,
    batchSize: flyerRequests.length,
    includeRepurposing: includeExtras,
  })

  for (const flyer of flyerResult.flyers) {
    const tracking = trackingByFlyerId.get(flyer.id)
    if (tracking) await backfillTrackingContent(tracking.code, flyer)

    await updateDeliverable(email, {
      type: "flyer",
      id: flyer.id,
      status: "Ready",
      downloadUrl: toDataUrl(flyer.html),
      ...(flyer.repurposed && {
        repurposed: {
          instagramDownloadUrl: toDataUrl(flyer.repurposed.instagramHtml),
          instagramCaption: flyer.repurposed.instagramCaption,
          textBlurb: flyer.repurposed.textBlurb,
          nextdoorPost: flyer.repurposed.nextdoorPost,
        },
      }),
      trackingCode: tracking?.code,
    })
  }
}

/**
 * Runs Brand -> Flyer for an already-normalized intake and updates
 * deliverable state directly (see lib/store.ts's updateDeliverable) as each
 * stage completes. Intended to be called via waitUntil() from /api/intake
 * so the response doesn't have to wait on it, but the serverless function
 * is kept alive until it actually finishes — AFTER the caller has already
 * checked the usage limit and incremented flyersCreated.
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

  const ids = flyerRequests.map((r) => r.id)

  try {
    await seedFlyerDeliverables(email, flyerRequests.map((r) => ({ id: r.id, purpose: r.purpose })))
    await markFlyersInProgress(email, ids)

    await withTimeout(runBatch(email, intake, flyerRequests), PIPELINE_TIMEOUT_MS)
  } catch (err) {
    const reason = describeFailure(err)
    console.error("[agent-pipeline] Pipeline failed:", reason)
    await markFlyersFailed(email, ids, reason).catch((e) => console.error("[agent-pipeline] Failed to record failure:", e))
  }
}

async function runSingleFlyerRetry(email: string, intake: NormalizedIntake, flyerRequest: FlyerRequest): Promise<void> {
  const brandProfile = await runBrandAgent(intake)
  const { includeExtras, allowAiPhotos } = await getPlanFeatures(email)
  const photos = await buildPhotoPool(intake, [flyerRequest], allowAiPhotos && intake.wantsAiPhotos)

  // A retry gets its own fresh tracking code (Basic+/Pro only) — the old
  // one, if this flyer had already generated once, is simply abandoned
  // along with its stats, since a regenerated flyer's content may no
  // longer match what a scan of the old QR would have promised.
  const tracking = includeExtras ? await createFlyerTrackingCode(email, flyerRequest.id, intake) : null

  const flyerResult = await runFlyerAgent({
    brandProfile,
    contact: intake.contact,
    photos,
    flyerRequests: [{ ...flyerRequest, qrCodeDataUrl: tracking?.qrDataUrl ?? null }],
    batchSize: 1,
    includeRepurposing: includeExtras,
  })

  const flyer = flyerResult.flyers[0]
  if (!flyer) throw new Error("Flyer Agent returned no result")

  if (tracking) await backfillTrackingContent(tracking.code, flyer)

  await updateDeliverable(email, {
    type: "flyer",
    id: flyer.id,
    status: "Ready",
    downloadUrl: toDataUrl(flyer.html),
    ...(flyer.repurposed && {
      repurposed: {
        instagramDownloadUrl: toDataUrl(flyer.repurposed.instagramHtml),
        instagramCaption: flyer.repurposed.instagramCaption,
        textBlurb: flyer.repurposed.textBlurb,
        nextdoorPost: flyer.repurposed.nextdoorPost,
      },
    }),
    trackingCode: tracking?.code,
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
