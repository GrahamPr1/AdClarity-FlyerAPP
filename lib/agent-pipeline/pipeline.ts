import type { IntakeSubmission } from "@/lib/types"
import { markAllFlyersInProgress, seedFlyerDeliverables, updateDeliverable } from "@/lib/store"
import { runIntakeAgent } from "./agents/intakeAgent"
import { runBrandAgent } from "./agents/brandAgent"
import { runFlyerAgent } from "./agents/flyerAgent"
import { generateImage } from "./higgsfield"
import type { IntakeAgentOutput, NormalizedIntake } from "./schemas/intake"
import type { FlyerRequest } from "./schemas/flyer"

export const MAX_FLYERS_PER_BATCH = 10

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

/**
 * Runs Brand -> Flyer for an already-normalized intake and updates
 * deliverable state as each stage completes, using the same update contract
 * the /api/agent-callback webhook exposes (see lib/store.ts's
 * updateDeliverable). Intended to be called fire-and-forget from
 * /api/intake — never awaited by the HTTP response — AFTER the caller has
 * already checked the usage limit and incremented flyersCreated.
 */
export async function continuePipelineFromIntake(intake: NormalizedIntake, flyerRequests: FlyerRequest[]): Promise<void> {
  try {
    await seedFlyerDeliverables(flyerRequests.map((r) => ({ id: r.id, purpose: r.purpose })))
    await markAllFlyersInProgress()

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
      await updateDeliverable({
        type: "flyer",
        id: flyer.id,
        status: "Ready",
        downloadUrl: toDataUrl(flyer.html),
      })
    }
  } catch (err) {
    console.error("[agent-pipeline] Pipeline failed:", err instanceof Error ? err.message : err)
  }
}
