import type { IntakeSubmission, PlanId } from "@/lib/types"
import { setClientFontChoice, getClientFontChoice, markFlyersInProgress, markFlyerFailed, markFlyersFailed, savePipelineState, seedFlyerDeliverables, updateDeliverable, getClient, saveBrandProfile, savePendingBrandProfile, setGenerationStage } from "@/lib/store"
import { runIntakeAgent } from "./agents/intakeAgent"
import { runBrandAgent } from "./agents/brandAgent"
import { runFlyerAgent } from "./agents/flyerAgent"
import { runEnterpriseFlyerAgent } from "./agents/flyerAgent"
import { getAgentProfile, listContentAssets } from "@/lib/store"
import { toAssetContext, findVerbatimViolations, findInventedComplianceLanguage } from "./enterprise"
import type { CampaignSource } from "@/lib/types"
import { runRepurposeAgent } from "./agents/repurposeAgent"
import { generateImage } from "./higgsfield"
import { findPhotoForPromotion, finalizePhotoUsage, type UnsplashPhoto } from "@/lib/unsplash"
import { createFlyerTrackingCode, backfillTrackingContent, qrDataUrlForCode } from "./qrTracking"
import { planIncludesExtras, aiPhotosEnabled, stockPhotosEnabled } from "./plan-features"
import { assignDesignVariants, PRESERVE_EXISTING_VARIANT } from "./design-variants"
import { palettePoolFor } from "./trade-palettes"
import { runPolishAgent } from "./agents/polishAgent"
import { fillTemplate, selectTemplate } from "./template-mode"
import { resolveBrandColors, resolveFonts } from "@/lib/brand-controls"
import { applyLegibilityGuardrails } from "./legibility"
import { getFormat, formatForAgent } from "./formats"
import type { IntakeAgentOutput, NormalizedIntake } from "./schemas/intake"
import type { FlyerRequest } from "./schemas/flyer"
import {
  QR_PLACEHOLDER,
  creditsUsedIn,
  injectPhotoAttribution,
  preservePhotoCredit,
  enforceSingleBottomAnchor,
  enforceBoundedContent,
  enforceCtaOwnRow,
  substituteQr,
  substituteLogo,
  collapseQrToToken,
  canonicalOfferFrom,
  assertOfferPreserved,
  toDataUrl,
} from "./flyer-html"

// QR tracking, multi-channel repurposing, and AI-generated photos are all
// real, server-side-gated features — never just hidden in the UI. Checked
// against the CLIENT's real enforcement plan (never the marketing-page
// selection — see the note on PlanId in lib/types.ts), same source of
// truth as the usage-limit check in /api/intake. Fetched once per
// batch/retry so both checks reflect the same plan snapshot.
async function getPlanFeatures(email: string): Promise<{ plan: PlanId | undefined; includeExtras: boolean }> {
  const client = await getClient(email)
  return {
    // The real plan travels with the flags so gates needing more than a
    // boolean (AI photos, which also needs the client's opt-in) can consult
    // it directly rather than reconstructing it.
    plan: client?.plan,
    includeExtras: planIncludesExtras(client?.plan), // Basic+/Pro: QR tracking, repurposing
  }
}

/** See qrEnabled — plan gate AND the client's own answer, both required. */
function wantsQr(includeExtras: boolean, intake: NormalizedIntake): boolean {
  return includeExtras && intake.wantsQrCode
}

export const MAX_FLYERS_PER_BATCH = 10

// No flyer should be able to sit "In Progress" forever — if the serverless
// function generating it gets frozen/reclaimed mid-run, or a real error
// hangs instead of rejecting promptly, this ceiling forces a Failed state
// instead of a silent stall. Overridable via env var so tests don't have to
// wait out the real ceiling.
//
// Bumped from 4 minutes after a real production run (Brand + Flyer with
// repurposing + QR tracking, sequential) genuinely needed more than 240s —
// a local repro of the same content completed Brand+Flyer alone in ~163s,
// so the extra QR/tracking overhead plus real model-latency variance in
// prod pushed it past the old ceiling 3 times in a row. Both API routes
// that call into this (see maxDuration in app/api/intake/route.ts and
// app/api/deliverables/retry/route.ts) explicitly claim 300s from the
// platform, so this stays with a ~15s margin under that — enough for the
// process to actually record the Failed state before the platform would
// kill the function outright.
const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS) || 285 * 1000

export class PipelineTimeoutError extends Error {}

// Every run that's hit PIPELINE_TIMEOUT_MS so far has hit it at EXACTLY the
// configured ceiling, never naturally finishing a bit early or a bit late —
// that pattern doesn't fit "the model is just being slow" (which would show
// real completion-time variance), so this logs a timestamp after each real
// stage boundary to reveal which specific stage a genuinely stuck run never
// gets past, rather than guessing again at another timeout number.
/**
 * Customer-facing names for the pipeline's real stages.
 *
 * Deliberately describes what is happening to THEIR campaign rather than
 * naming our agents — "Designing your flyer", not "Flyer Agent". Kept next to
 * stageMark so the internal log labels and the customer-visible ones can't
 * drift apart unnoticed.
 */
export const GENERATION_STAGES = {
  brand: "Working out your brand look",
  photos: "Preparing your images",
  flyer: "Designing your flyer",
  repurpose: "Creating your social and text versions",
} as const

/**
 * Replaces the Brand Agent's font pairing with the client's explicit pick.
 *
 * Enforced here rather than asked of the prompt, the same treatment the QR
 * token, the Unsplash credit and the logo get: a chosen font that only
 * sometimes survives is worse than no picker at all, because the client sees
 * their choice and the print does something else.
 *
 * A no-op when nothing was picked, so the Brand Agent's own choice from
 * fontStylePreference keeps working exactly as today.
 */
async function applyFontChoice<T extends { fonts: { heading: string; body: string } }>(
  brandProfile: T,
  email: string,
): Promise<T> {
  const fonts = resolveFonts(await getClientFontChoice(email).catch(() => null))
  if (!fonts) return brandProfile
  console.log(`[brand] ${email}: applying chosen fonts ${fonts.heading.split(",")[0]} / ${fonts.body.split(",")[0]}`)
  return { ...brandProfile, fonts }
}

function stageMark(runId: string, t0: number, label: string) {
  console.log(`[agent-pipeline] ${runId}: ${label} at +${Math.round((Date.now() - t0) / 1000)}s`)
}

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
 * How long to keep watching in-flight work after PIPELINE_TIMEOUT_MS fires,
 * before calling it a failure.
 *
 * PIPELINE_TIMEOUT_MS answers "should we still be waiting?", which is a
 * question about OUR budget. It was being used to answer "did the generation
 * fail?", which is a question about the AGENT — and the two are not the same.
 * A real run crossed the ceiling at 285s and the Flyer Agent then returned
 * successfully at 350s: the work succeeded, and the client had already been
 * shown "Failed" with a retry button that would have burned a second
 * generation on work that was about to land.
 *
 * So the timeout now starts a decision rather than concluding one. This
 * spends most of the ~15s margin the ceiling deliberately leaves under the
 * platform's 300s limit watching how the work actually ends, keeping enough
 * to record the result before the function is reclaimed.
 *
 * Env-overridable for the same reason PIPELINE_TIMEOUT_MS is: tests must be
 * able to drive both sides of this without waiting out real ceilings.
 */
const TIMEOUT_GRACE_MS = Number(process.env.PIPELINE_TIMEOUT_GRACE_MS) || 10 * 1000

type Settled<T> = { state: "resolved"; value: T } | { state: "rejected"; reason: unknown } | { state: "pending" }

/**
 * Observes how `promise` ends, giving up after `ms` — without abandoning it.
 *
 * Distinct from withTimeout, which races and discards. Here the caller has
 * already decided to stop waiting and needs to know WHY it stopped: work that
 * succeeded late, work that genuinely failed, or work that is still stuck.
 * Those three lead to three different deliverable states.
 */
export async function settleWithin<T>(promise: Promise<T>, ms: number): Promise<Settled<T>> {
  // A rejection arriving after we stop watching is expected, not a crash —
  // without this it surfaces as an unhandled rejection and can take the
  // process down.
  promise.catch(() => {})

  let timer: ReturnType<typeof setTimeout> | undefined
  const pending = new Promise<Settled<T>>((resolve) => {
    timer = setTimeout(() => resolve({ state: "pending" }), ms)
  })
  try {
    return await Promise.race([
      promise.then(
        (value): Settled<T> => ({ state: "resolved", value }),
        (reason): Settled<T> => ({ state: "rejected", reason }),
      ),
      pending,
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Turns "we stopped waiting" into the outcome that actually happened.
 *
 * Returns null when the work succeeded after all — the caller should record
 * nothing, because the success path has already written its own Ready state.
 * Otherwise returns the error to report: the real rejection if there was one,
 * or the original timeout if the work is still stuck.
 *
 * Note what this deliberately does NOT do: it does not stop a genuinely
 * stalled run from being marked Failed. That guarantee is why the ceiling
 * exists (see PIPELINE_TIMEOUT_MS) and a flyer must never sit In Progress
 * forever because a function was frozen or reclaimed mid-run.
 */
export async function resolveTimeoutOutcome<T>(
  work: Promise<T>,
  timeoutErr: unknown,
  runId: string,
  /** Injectable so tests can drive all three outcomes without waiting out the real grace. */
  graceMs: number = TIMEOUT_GRACE_MS,
): Promise<unknown | null> {
  if (!(timeoutErr instanceof PipelineTimeoutError)) return timeoutErr

  const settled = await settleWithin(work, graceMs)
  if (settled.state === "resolved") {
    console.warn(
      `[agent-pipeline] ${runId}: exceeded the ${Math.round(PIPELINE_TIMEOUT_MS / 1000)}s ceiling but COMPLETED during the grace window — recording success, not failure.`,
    )
    return null
  }
  if (settled.state === "rejected") return settled.reason
  return timeoutErr
}

/**
 * Strips billing/plan-selection and segmentation fields the agents have no
 * use for and passes everything else through in the site's own raw shape —
 * the Intake Agent's prompt is written to normalize exactly this shape
 * (services as {id,name}[], socialHandles/brandColors/flyerNotes as
 * free-text strings, yearsInBusiness as a string, etc). No structural
 * adaptation happens here; that normalization work stays inside the Intake
 * Agent per design.
 *
 * businessCategory gets the same treatment as planId: it's written directly
 * to the client's ClientRecord by /api/intake (see setClientBusinessCategory
 * in lib/store.ts) before the pipeline ever runs — a real segmentation tag,
 * not something for the agent to normalize or have an opinion on.
 */
/**
 * What the Intake Agent is allowed to see.
 *
 * planId/businessCategory/submittedAt were already excluded because they are
 * set on the ClientRecord in code and the agent has no business touching them.
 * The brand-control fields belong to that same category and caused two real
 * bugs by being visible:
 *
 *   1. TRUNCATION. The agent has no output slot for brandColorHexes,
 *      brandColorsOverrideScan or fontChoiceId, but is instructed to narrate
 *      anything it can't place into `normalizationNotes`. The extra narration
 *      pushed the response past max_tokens, and POST /api/intake returned 500
 *      with AgentTruncatedError. Measured: a payload with these fields failed
 *      3/3 through the route while the same payload without them succeeded.
 *   2. MISLABELLED COLOUR SOURCE. The agent is told to normalise colours into
 *      `existingColors`. Seeing brandColorHexes, it folded them in — so
 *      resolveBrandColors found a non-empty "scanned" value and reported
 *      manual colours as scanned. The values were right by luck; the
 *      precedence logic was being bypassed entirely.
 *
 * logoUrl and existingMaterialsUrl go too: both are consumed in code (stamped
 * below / stored for retrieval), and the prompt already tells the agent to
 * always null brandAssets.logoUrl. logoFileName and existingMaterialsFileName
 * stay — the prompt refers to them by name.
 */
export function buildRawIntakePayload(submission: IntakeSubmission) {
  const {
    planId, businessCategory, submittedAt,
    brandColorHexes, brandColorsOverrideScan, fontChoiceId,
    logoUrl, existingMaterialsUrl,
    ...rest
  } = submission
  return rest
}

// Packs in real, specific business context (not just industry) so the
// generated image reads as belonging to THIS business's actual site and
// service rather than a generic stock photo — the flyer's own purpose/notes,
// the real services offered, and who it's for.
function buildAiPhotoPrompt(intake: NormalizedIntake, request: FlyerRequest): string {
  const services = intake.services.slice(0, 3).join(", ")
  const noteContext = request.notes ? ` — ${request.notes}` : ""
  // The negative constraints are spelled out rather than listed, because the
  // terse version did not hold: measured against z_image, "no people, no
  // text, no logos" produced a photo of a technician with a fake ad banner
  // and garbled lettering baked in. Both matter beyond aesthetics — an
  // AI-generated person on a local business's flyer reads as a photo of
  // their staff, and gibberish text printed on a real flyer is unshippable.
  // The expanded wording below was verified to produce a clean, empty,
  // on-brief scene at the same price.
  return (
    `${intake.industry} business, ${request.purpose}${noteContext}, ` +
    `offering ${services}, for an audience of ${intake.targetAudience}. ` +
    `Empty scene, equipment and workspace only. ` +
    `Absolutely no people, no faces, no hands, no human figures. ` +
    `No text, no signage, no logos, no watermarks, no lettering of any kind. ` +
    `Professional environment, warm natural lighting, documentary photography style.`
  )
}

/**
 * Sources one candidate photo per flyer request.
 *
 * Order is Unsplash first, Higgsfield second, CSS-only last.
 *
 * Unsplash is primary because it returns real photographs at no per-image
 * cost; Higgsfield generates a bespoke image but bills credits per call, so
 * it now runs only when Unsplash has nothing on-topic. Both sit behind the
 * SAME gate as before — Pro plan AND the client's explicit wantsAiPhotos
 * opt-in — so this change alters which source is tried, never who gets
 * photos. (Worth revisiting: that opt-in is worded as "AI-generated photos",
 * which no longer describes an Unsplash stock photo.)
 *
 * Never throws. A miss at every level just means fewer photos in the pool,
 * and the Flyer Agent's CSS-only design already handles that well — which is
 * exactly why a weak Unsplash match is rejected rather than used.
 */
async function buildPhotoPool(
  intake: NormalizedIntake,
  flyerRequests: FlyerRequest[],
  gates: { allowStockPhotos: boolean; allowAiGeneration: boolean },
): Promise<{ photos: NormalizedIntake["photos"]; unsplash: UnsplashPhoto[] }> {
  // A client's own photographs always win, and need no attribution.
  if (intake.photos.length > 0) {
    console.log(`[photo-pool] using ${intake.photos.length} client-supplied photo(s); no stock lookup needed.`)
    return { photos: intake.photos, unsplash: [] }
  }

  // Every exit below says WHY. The bug this replaces was a silent early
  // return: a single flag gated both sources, so a free-trial flyer skipped
  // Unsplash without logging anything and landed on the no-photo design,
  // which was indistinguishable from "Unsplash found nothing".
  if (!gates.allowStockPhotos && !gates.allowAiGeneration) {
    console.log("[photo-pool] skipped: both stock and AI photo sources are disabled for this flyer.")
    return { photos: [], unsplash: [] }
  }

  const sourced = await Promise.allSettled(
    flyerRequests.map(async (request) => {
      const context = `flyer "${request.purpose}"`

      // Promotion-led, with the broad industry query as the fallback — see
      // findPhotoForPromotion. The old single query put industry first and hit
      // the three-term cap before reaching the offer, so what the flyer was
      // actually advertising never influenced the photo.
      const found = gates.allowStockPhotos
        ? await findPhotoForPromotion({
            industry: intake.industry,
            purpose: request.purpose,
            services: intake.services,
            context,
          })
        : ({ ok: false, reason: "not_configured", detail: "stock photos disabled for this flyer" } as const)

      if (found.ok) {
        return {
          photo: { url: found.photo.url, caption: `Stock photo — suggested for: ${request.purpose}` },
          // UnsplashPhoto already carries every field PhotoCredit needs,
          // so it doubles as the credit record — one list, no drift.
          unsplash: found.photo,
        }
      }

      // Logged per reason so we can see how often each trade falls through —
      // "thin_results" is a library-coverage problem, "rate_limited" is the
      // 50/hr demo ceiling, and they need different fixes.
      console.log(`[photo-pool] ${context}: unsplash skipped/miss (${found.reason}) — ${found.detail}`)

      if (!gates.allowAiGeneration) {
        console.log(`[photo-pool] ${context}: higgsfield not attempted (needs Pro plan + the client's wantsAiPhotos opt-in) — CSS-only design.`)
        return null
      }
      const generated = await generateImage({ context, prompt: buildAiPhotoPrompt(intake, request) })
      if (generated) {
        return {
          photo: { url: generated.url, caption: `AI-generated, illustrative — suggested for: ${request.purpose}` },
          unsplash: null,
        }
      }

      console.log(`[photo-pool] ${context}: no photo from any source — CSS-only design.`)
      return null
    }),
  )

  const hits = sourced
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is NonNullable<typeof v> => v !== null)

  return {
    photos: hits.map((h) => h.photo),
    unsplash: hits.map((h) => h.unsplash).filter((u): u is UnsplashPhoto => u !== null),
  }
}

/**
 * Honours the two obligations that come with using an Unsplash photo, for
 * the photos that genuinely reached this flyer's final HTML.
 *
 * Kept as one function on purpose: the API Guidelines require BOTH a credit
 * and a download trigger, and pairing them here means neither can be
 * satisfied without the other. Matching against the finished HTML rather
 * than the candidate pool is what makes "actually used" true — the agent is
 * free to use none of the photos it was offered.
 */
async function applyPhotoObligations(
  html: string,
  unsplash: UnsplashPhoto[],
  formatId: string | undefined,
  context: string,
): Promise<string> {
  const used = creditsUsedIn(html, unsplash)
  if (used.length === 0) {
    // The distinction that was previously invisible. prompts/flyer.ts
    // explicitly permits the agent to design with zero photos when nothing
    // in `photos` fits ("design that flyer with zero photos instead"), so a
    // flyer with no <img> and no credit has TWO possible histories: no photo
    // was ever sourced, or one was sourced and declined. Without this line
    // they are indistinguishable after the fact, which is exactly what made
    // the "why is there no photo?" question unanswerable.
    if (unsplash.length > 0) {
      console.log(
        `[photo-pool] ${context}: agent DECLINED all ${unsplash.length} available photo(s) — ` +
          `composed with zero photos. Not a sourcing failure; see rule 5 in prompts/flyer.ts.`,
      )
    }
    return html
  }
  await finalizePhotoUsage(used, context)
  return injectPhotoAttribution(html, used, getFormat(formatId).medium)
}

/**
 * Legibility pass, run on every flyer before it is stored.
 *
 * Unconditional — not gated on whether a photo came from Unsplash — because
 * a client's OWN uploaded photo can bury text just as effectively as a stock
 * one. Returns the html unchanged when there is nothing sitting on an image.
 *
 * Contrast failures are logged, not thrown. Regenerating is the most
 * expensive call in the pipeline (~100s and a real model bill), and this
 * check can only see the elements whose colours are resolvable — so a retry
 * triggered by it would sometimes be spending that on a false positive. The
 * scrim is what actually prevents the failure; this reports what it could
 * and could not verify.
 */
function applyLegibility(html: string, context: string): string {
  // Structural first: a collision clips text outright, which is worse than
  // any contrast problem the scrim then fixes.
  // Order matters: lift the CTA out FIRST, so the bound applied next can
  // only ever clip body copy, never the call to action.
  const lifted = enforceCtaOwnRow(html)
  if (lifted.moved) console.log(`[layout] ${context}: moved CTA (${lifted.moved}) out of the growable track into its own row`)
  const grown = enforceBoundedContent(lifted.html)
  if (grown.bounded.length > 0) {
    console.log(`[layout] ${context}: bounded ${grown.bounded.length} growable region(s) — ${grown.bounded.join(", ")}`)
  }
  const anchored = enforceSingleBottomAnchor(grown.html)
  if (anchored.neutralised.length > 0) {
    console.log(`[layout] ${context}: neutralised ${anchored.neutralised.length} extra bottom anchor(s) — ${anchored.neutralised.join(", ")}`)
  }
  const { html: guarded, report } = applyLegibilityGuardrails(anchored.html)
  if (report.scrimsInjected > 0 || report.contrastFailures.length > 0) {
    console.log(
      `[legibility] ${context}: ${report.scrimsInjected} scrim(s) injected, ` +
        `${report.contrastFailures.length} contrast failure(s), ${report.unresolved} image(s) not geometrically verifiable`,
    )
    for (const f of report.contrastFailures) {
      console.warn(`[legibility] ${context}: ${f.ratio}:1 (needs ${f.required}:1) — "${f.text}"`)
    }
  }
  return guarded
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
  const result = await runIntakeAgent(rawPayload, submission.contact.email.trim().toLowerCase())

  // The prompt asks the agent to copy wantsQrCode verbatim, but a client's
  // explicit yes/no shouldn't depend on a model getting a copy instruction
  // right — overwrite it with the submitted value. Absent means true: every
  // campaign made before this question existed got a QR code, and silently
  // dropping it for anyone who doesn't re-answer would be a regression.
  if (result.data) {
    result.data.wantsQrCode = submission.wantsQrCode ?? true
    // The client picked one format for this submission; it applies to every
    // piece the agent split flyerNotes into. Stamped here rather than trusted
    // to the model for the same reason as wantsQrCode — an explicit choice
    // shouldn't depend on a copy instruction being followed, and this one
    // decides the physical canvas.
    const formatId = getFormat(submission.formatId).id
    for (const request of result.data.flyerRequests) request.formatId = formatId
    // Same reasoning again. The intake prompt instructs the agent to ALWAYS
    // null brandAssets.logoUrl so it can never invent one, which means the
    // real uploaded URL has to be stamped on here. Falls back to whatever is
    // already set, so a logo found by the website scraper still survives.
    stampClientPreferences(result.data, submission)
    await setClientFontChoice(submission.contact.email, submission.fontChoiceId ?? null)
  }
  return result
}

/**
 * Applies the client's own explicit choices over whatever the agent returned.
 *
 * Same treatment wantsQrCode and formatId already get: an explicit choice must
 * not depend on a model following a copy instruction. Exported so tests can
 * drive the REAL wiring rather than the pure helpers underneath it — both bugs
 * this function exists to prevent hid behind green unit tests of
 * resolveBrandColors and substituteLogo in isolation.
 */
export function stampClientPreferences(data: NormalizedIntake, submission: IntakeSubmission): void {
  const uploadedLogo = submission.logoUrl?.trim()
  if (uploadedLogo) data.brandAssets.logoUrl = uploadedLogo

  const resolved = resolveBrandColors({
    scanned: data.brandAssets.existingColors,
    manual: submission.brandColorHexes,
    manualOverridesScan: submission.brandColorsOverrideScan,
  })
  data.brandAssets.existingColors = resolved.colors
  if (resolved.source !== "none") {
    console.log(`[brand] ${submission.contact.email}: using ${resolved.source} colours ${resolved.colors!.join(", ")}`)
  }
}

/**
 * Template mode's stand-in for the Flyer Agent.
 *
 * Returns the SAME shape runFlyerAgent does, so the call site, the
 * post-processing chain and the deliverable write are all untouched — the only
 * difference is where the HTML came from. One ~512-token text call replaces a
 * ~8,070-token HTML call.
 */
async function runTemplateFlyer(
  input: Parameters<typeof runFlyerAgent>[0],
  agentEmail: string,
  intake: NormalizedIntake,
): Promise<Awaited<ReturnType<typeof runFlyerAgent>>> {
  type Spec = Awaited<ReturnType<typeof runFlyerAgent>>["flyers"][number]
  const flyers: Spec[] = []
  for (const request of input.flyerRequests) {
    const template = selectTemplate(request.id)
    const polished = await runPolishAgent(
      {
        businessName: intake.businessName,
        industry: intake.industry,
        promotion: [request.purpose, request.notes].filter(Boolean).join(" — "),
        targetAudience: intake.targetAudience,
        voiceTone: intake.voiceTonePreference,
        budgets: template.budgets,
      },
      agentEmail,
      request.id,
    )

    const palette = input.brandProfile?.colors ?? []
    const filled = fillTemplate({
      template,
      headline: polished.headline,
      supporting: polished.supporting,
      businessName: intake.businessName,
      phone: intake.contact.phone,
      address: intake.contact.address,
      hasLogo: Boolean(intake.brandAssets.logoUrl),
      hasQr: Boolean(request.qrCodeDataUrl),
      photoUrl: input.photos[0]?.url ?? null,
      colors: {
        primary: palette[0]?.hex ?? "#12314f",
        secondary: palette[1]?.hex ?? "#eef1f4",
        accent: palette[2]?.hex ?? "#e39a2b",
      },
      fonts: input.brandProfile?.fonts ?? { heading: "Georgia, serif", body: "Georgia, serif" },
    })

    if (filled.truncated.length > 0) {
      console.log(`[template] flyer ${request.id}: ${template.id} — budget cut ${filled.truncated.join(", ")}`)
    } else {
      console.log(`[template] flyer ${request.id}: ${template.id} — all slots within budget`)
    }

    flyers.push({
      id: request.id,
      purpose: request.purpose,
      dimensions: getFormat(request.formatId).dimensions,
      headline: polished.headline,
      subheadline: polished.supporting,
      offer: polished.supporting,
      cta: intake.contact.phone,
      disclaimer: null,
      html: filled.html,
      paletteUsed: {
        primary: palette[0]?.hex ?? "#12314f",
        secondary: palette[1]?.hex ?? "#eef1f4",
        accent: palette[2]?.hex ?? "#e39a2b",
      },
      fontsUsed: input.brandProfile?.fonts ?? { heading: "Georgia, serif", body: "Georgia, serif" },
      repurposed: null,
    } as Spec)
  }
  return { flyers }
}

async function runBatch(runId: string, t0: number, email: string, intake: NormalizedIntake, flyerRequests: FlyerRequest[], autoSaveBrandProfile: boolean): Promise<void> {
  await setGenerationStage(email, GENERATION_STAGES.brand)
  const brandProfile = await applyFontChoice(await runBrandAgent(intake, email), email)
  stageMark(runId, t0, "brand done")
  // Guided-flow submissions refresh the client's saved brand automatically
  // — they explicitly provided this info, so it's a strong signal. Quick
  // Prompt's inferred brand is a weaker signal (see SavedBrandProfile in
  // lib/types.ts) and never overwrites silently; continuePipelineFromIntake's
  // caller controls this via autoSaveBrandProfile.
  if (autoSaveBrandProfile) {
    await saveBrandProfile(email, brandProfile, intake.contact).catch((e) => console.error("[agent-pipeline] Failed to save brand profile:", e))
  } else if (flyerRequests[0]) {
    // Quick Prompt path — scratch-saved per flyerId (not the client's real
    // saved brand) for the "save this as your brand?" opt-in and
    // refinement's need for the same brand context. See
    // savePendingBrandProfile in lib/store.ts.
    await savePendingBrandProfile(flyerRequests[0].id, brandProfile, intake.contact).catch((e) => console.error("[agent-pipeline] Failed to save pending brand profile:", e))
  }
  const { plan, includeExtras } = await getPlanFeatures(email)
  if (stockPhotosEnabled(plan) || aiPhotosEnabled(plan, intake.wantsAiPhotos)) await setGenerationStage(email, GENERATION_STAGES.photos)
  const { photos, unsplash: unsplashPool } = await buildPhotoPool(intake, flyerRequests, {
    allowStockPhotos: stockPhotosEnabled(plan),
    allowAiGeneration: aiPhotosEnabled(plan, intake.wantsAiPhotos),
  })
  stageMark(runId, t0, "photo pool ready")

  // One tracking code + QR image per flyer, generated before the agent call
  // — it needs a real, ready image to embed, the same way it needs real
  // photo URLs (see buildPhotoPool). Skipped on Trial (no tracking record, no
  // QR, nothing to embed) and skipped when the client answered "no" to the QR
  // question. The code -> flyerId mapping lets the backfill step below match
  // each agent response back to its own record.
  const trackingByFlyerId = new Map(
    wantsQr(includeExtras, intake)
      ? await Promise.all(flyerRequests.map(async (r) => [r.id, await createFlyerTrackingCode(email, r.id, intake)] as const))
      : [],
  )
  stageMark(runId, t0, "tracking codes ready")

  // One distinct composition per flyer, decided here rather than by the agent
  // (see design-variants.ts). Palette variation is allowed ONLY when the brand
  // colours were invented for this client — if they gave us real colours, or
  // we scraped them from their site, every flyer keeps that palette and only
  // the layout differs.
  // Layouts are restricted to what each canvas can carry, so a batch mixing
  // formats never lands a split-vertical composition on a door hanger. When a
  // batch shares one format (the normal case) this is just that format's pool.
  const sharedFormat = getFormat(flyerRequests[0]?.formatId)
  // Palette is seeded from the BUSINESS so every piece they ever get shares
  // one colour language; layout stays seeded per flyer so a batch of three
  // still reads as three distinct pieces. See assignDesignVariants.
  const client = await getClient(email)
  const variants = assignDesignVariants(
    flyerRequests.map((r) => r.id),
    brandProfile?.colorSource === "agent_proposed",
    sharedFormat.allowedLayouts,
    {
      businessSeed: `${intake.businessName}:${client?.businessCategory ?? "Other"}`,
      palettePool: palettePoolFor(client?.businessCategory),
    },
  )

  const flyerRequestsWithQr = flyerRequests.map((r) => ({
    ...r,
    // The token, not the 4KB data URL — see substituteQr above.
    qrCodeDataUrl: trackingByFlyerId.get(r.id) ? QR_PLACEHOLDER : null,
    format: formatForAgent(r.formatId),
    designVariant: variants.get(r.id)!,
  }))

  // ONE CALL PER FLYER, RUN CONCURRENTLY — not one call producing the batch.
  //
  // Latency is linear in output tokens (~111 tok/s measured), so a single
  // call emitting N complete HTML documents has to stream all N serially.
  // Measured on a batch of 3: one batched call 179.0s vs three concurrent
  // calls 126.2s — 52.8s (29%) faster for identical output.
  //
  // The original reason for batching was letting the model see all the
  // flyers at once so it could make them different from each other. That
  // reason is gone: each flyer's composition and palette are now assigned
  // deterministically in code before the call (see design-variants.ts), so
  // distinctness no longer depends on shared context.
  //
  // Per-flyer isolation is a real gain on top of the speed: one flyer
  // failing used to lose the whole batch, since a single response either
  // parsed or didn't. Now a failure is confined to its own flyer and the
  // rest still deliver.
  //
  // includeRepurposing stays false here: repurposing runs as its own call
  // below. Asking for both in one response meant emitting two complete HTML
  // documents plus three pieces of copy, which reliably blew
  // PIPELINE_TIMEOUT_MS on Basic/Pro.
  await setGenerationStage(email, GENERATION_STAGES.flyer)

  // ---- Enterprise mode (additive; SMB is the untouched default) ----------
  //
  // Triggered by DATA, not a query parameter: a client whose AgentProfile
  // names an org that actually has approved assets generates from that
  // library. A query-param trigger would have to thread a new argument
  // through continuePipelineFromIntake and runBatch, changing both
  // signatures — the exact modification this brief forbids. It is also what
  // production would do anyway; Brief 3's demo route seeds the profile.
  //
  // Every lookup fails soft to null, so an enterprise misconfiguration
  // degrades to a normal SMB generation rather than failing a campaign.
  const agentProfile = await getAgentProfile(email).catch(() => null)
  const approvedAssets = agentProfile?.orgId
    ? toAssetContext(await listContentAssets(agentProfile.orgId).catch(() => []))
    : []
  const enterpriseAssets = approvedAssets.length > 0 ? approvedAssets : null
  // Opt-in for the pilot. Off by default, so the SMB AI path is what every
  // existing client still gets.
  const templateMode = process.env.TEMPLATE_MODE === "on" 
  if (enterpriseAssets) {
    console.log(`[enterprise] ${email}: composing from ${enterpriseAssets.length} approved asset(s) in org ${agentProfile!.orgId}`)
  }
  const sourcesByFlyerId = new Map<string, CampaignSource[]>()

  // One expression, so the dispatch costs a single changed line below rather
  // than a conditional woven through the call site. The enterprise path has
  // its own input shape and output schema (see enterprise.ts) — this does not
  // alter what the SMB call sends.
  const runFlyerForRequest = async (input: Parameters<typeof runFlyerAgent>[0], agentEmail: string) => {
    if (templateMode) return runTemplateFlyer(input, agentEmail, intake)
    if (!enterpriseAssets) return runFlyerAgent(input, agentEmail)
    const out = await runEnterpriseFlyerAgent({ ...input, approvedAssets: enterpriseAssets }, agentEmail)
    for (const flyer of out.flyers) {
      sourcesByFlyerId.set(flyer.id, out.sources)
      const violations = findVerbatimViolations(flyer.html, out.sources, enterpriseAssets)
      for (const v of violations) {
        console.error(`[enterprise] VERBATIM VIOLATION on flyer ${flyer.id}: locked asset "${v.label}" (${v.assetId}) was not reproduced exactly. Expected to contain: "${v.expectedOpening}…"`)
      }
      // A second, independent check: approved text unaltered is not the same
      // as no unapproved text added. See findInventedComplianceLanguage.
      const invented = findInventedComplianceLanguage(flyer.html, enterpriseAssets)
      for (const v of invented) {
        console.error(`[enterprise] INVENTED COMPLIANCE LANGUAGE on flyer ${flyer.id} [${v.pattern}]: "${v.text}"`)
      }
      if (violations.length === 0 && invented.length === 0) {
        console.log(`[enterprise] flyer ${flyer.id}: both checks clean (${out.sources.length} source(s) claimed)`)
      }
    }
    return out
  }

  const settled = await Promise.allSettled(
    flyerRequestsWithQr.map((request) =>
      runFlyerForRequest({
        brandProfile,
        contact: intake.contact,
        photos,
        hasLogo: Boolean(intake.brandAssets.logoUrl),
        flyerRequests: [request],
        batchSize: 1,
        includeRepurposing: false,
      }, email),
    ),
  )

  const flyerResult = { flyers: settled.flatMap((r) => (r.status === "fulfilled" ? r.value.flyers : [])) }

  // Mark the ones that genuinely failed, so they show as Failed and stay
  // retryable rather than sitting In Progress forever.
  const failed = settled
    .map((r, i) => (r.status === "rejected" ? { request: flyerRequestsWithQr[i], reason: r.reason } : null))
    .filter((x): x is { request: (typeof flyerRequestsWithQr)[number]; reason: unknown } => x !== null)
  for (const { request, reason } of failed) {
    console.error(`[agent-pipeline] Flyer ${request.id} failed (others in this batch are unaffected):`, reason)
    await markFlyerFailed(email, request.id, describeFailure(reason)).catch(() => {})
  }
  if (flyerResult.flyers.length === 0) {
    // Every flyer failed — surface it as a real error rather than silently
    // "completing" a run that produced nothing.
    throw settled.find((r) => r.status === "rejected")?.reason ?? new Error("Flyer Agent returned no result")
  }
  stageMark(runId, t0, `flyer agents done (${flyerResult.flyers.length} ok, ${failed.length} failed)`)

  // Flyers are marked Ready FIRST, before any repurposing is attempted, so
  // the thing the client actually asked for is in their hands as early as
  // possible and can't be lost to a later failure.
  for (const flyer of flyerResult.flyers) {
    const tracking = trackingByFlyerId.get(flyer.id)
    if (tracking) await backfillTrackingContent(tracking.code, flyer)

    await updateDeliverable(email, {
      type: "flyer",
      id: flyer.id,
      status: "Ready",
      downloadUrl: toDataUrl(
        substituteLogo(
          substituteQr(
            await applyPhotoObligations(applyLegibility(flyer.html, `flyer ${flyer.id}`), unsplashPool, flyerRequests[0]?.formatId, `flyer ${flyer.id}`),
            tracking?.qrDataUrl ?? null,
          ),
          intake.brandAssets.logoUrl,
        ),
      ),
      trackingCode: tracking?.code,
    })
  }

  // Written as a second, additive pass so the SMB deliverable write above is
  // untouched. No-op for SMB: sourcesByFlyerId is only ever populated on the
  // enterprise path.
  for (const [flyerId, sources] of sourcesByFlyerId) {
    if (sources.length > 0) await updateDeliverable(email, { type: "flyer", id: flyerId, sources })
  }

  if (!includeExtras) {
    await setGenerationStage(email, null)
    return
  }

  await setGenerationStage(email, GENERATION_STAGES.repurpose)

  // Second pass: the Instagram/text/Nextdoor versions, one call per flyer,
  // derived from that flyer's own generated copy so the offer is copied
  // rather than re-invented (see the consistency rules in the repurpose
  // prompt). Each is attached as it completes, and a failure here is logged
  // and swallowed — the flyer is already delivered, so degrading to
  // "flyer only" beats marking a finished campaign Failed.
  await Promise.all(
    flyerResult.flyers.map(async (flyer) => {
      try {
        const repurposed = await runRepurposeAgent(
          {
            brandProfile,
            contact: intake.contact,
            flyer: canonicalOfferFrom(flyer),
          },
          email,
        )
        assertOfferPreserved(flyer.id, flyer, repurposed)
        await updateDeliverable(email, {
          type: "flyer",
          id: flyer.id,
          repurposed: {
            instagramDownloadUrl: toDataUrl(repurposed.instagramHtml),
            instagramCaption: repurposed.instagramCaption,
            textBlurb: repurposed.textBlurb,
            nextdoorPost: repurposed.nextdoorPost,
          },
        })
      } catch (e) {
        console.error(`[agent-pipeline] Repurposing failed for flyer ${flyer.id} (flyer itself is delivered):`, e)
      }
    }),
  )
  stageMark(runId, t0, "repurposing done")
  await setGenerationStage(email, null)
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
export async function continuePipelineFromIntake(
  email: string,
  intake: NormalizedIntake,
  flyerRequests: FlyerRequest[],
  autoSaveBrandProfile: boolean = true,
): Promise<void> {
  // Saved before generation starts (not after) so a retry has something to
  // work with even if this very attempt is what fails.
  await savePipelineState(email, intake, flyerRequests)

  const ids = flyerRequests.map((r) => r.id)
  const runId = ids.join(",")
  const t0 = Date.now()
  let batch: Promise<void> | undefined

  try {
    await seedFlyerDeliverables(email, flyerRequests.map((r) => ({ id: r.id, purpose: r.purpose })))
    await markFlyersInProgress(email, ids)
    stageMark(runId, t0, "seeded, marked in-progress")

    // Held in a variable so the timeout path can keep observing it rather
    // than abandoning it — see resolveTimeoutOutcome.
    batch = runBatch(runId, t0, email, intake, flyerRequests, autoSaveBrandProfile)
    await withTimeout(batch, PIPELINE_TIMEOUT_MS)
  } catch (err) {
    const outcome = batch ? await resolveTimeoutOutcome(batch, err, runId) : err
    // Completed late. runBatch already wrote its own Ready state, and
    // overwriting that with Failed is the bug this exists to prevent.
    if (outcome === null) {
      await setGenerationStage(email, null)
      return
    }

    const reason = describeFailure(outcome)
    console.error("[agent-pipeline] Pipeline failed:", reason)
    await markFlyersFailed(email, ids, reason).catch((e) => console.error("[agent-pipeline] Failed to record failure:", e))
    // Clear the progress label too — a failed run must not sit showing
    // "Designing your flyer…" until the TTL expires.
    await setGenerationStage(email, null)
  }
}

async function runSingleFlyerRetry(runId: string, t0: number, email: string, intake: NormalizedIntake, flyerRequest: FlyerRequest): Promise<void> {
  await setGenerationStage(email, GENERATION_STAGES.brand)
  const brandProfile = await applyFontChoice(await runBrandAgent(intake, email), email)
  stageMark(runId, t0, "brand done")
  const { plan, includeExtras } = await getPlanFeatures(email)
  const { photos, unsplash: unsplashPool } = await buildPhotoPool(intake, [flyerRequest], {
    allowStockPhotos: stockPhotosEnabled(plan),
    allowAiGeneration: aiPhotosEnabled(plan, intake.wantsAiPhotos),
  })
  stageMark(runId, t0, "photo pool ready")

  // A retry gets its own fresh tracking code (Basic+/Pro only) — the old
  // one, if this flyer had already generated once, is simply abandoned
  // along with its stats, since a regenerated flyer's content may no
  // longer match what a scan of the old QR would have promised.
  const tracking = wantsQr(includeExtras, intake) ? await createFlyerTrackingCode(email, flyerRequest.id, intake) : null
  stageMark(runId, t0, "tracking code ready")

  // Same two-pass split as runBatch — see the note there on why repurposing
  // is no longer requested from the Flyer Agent in the same call.
  await setGenerationStage(email, GENERATION_STAGES.flyer)
  const flyerResult = await runFlyerAgent({
    brandProfile,
    contact: intake.contact,
    photos,
    hasLogo: Boolean(intake.brandAssets.logoUrl),
    flyerRequests: [
      {
        ...flyerRequest,
        qrCodeDataUrl: tracking ? QR_PLACEHOLDER : null,
        // Seeded from the flyer id, so a retry lands on the same composition
        // the client was already shown rather than silently redesigning it.
        format: formatForAgent(flyerRequest.formatId),
        designVariant: assignDesignVariants(
          [flyerRequest.id],
          brandProfile?.colorSource === "agent_proposed",
          getFormat(flyerRequest.formatId).allowedLayouts,
        ).get(flyerRequest.id)!,
      },
    ],
    batchSize: 1,
    includeRepurposing: false,
  }, email)
  stageMark(runId, t0, "flyer agent done")

  const flyer = flyerResult.flyers[0]
  if (!flyer) throw new Error("Flyer Agent returned no result")

  if (tracking) await backfillTrackingContent(tracking.code, flyer)

  await updateDeliverable(email, {
    type: "flyer",
    id: flyer.id,
    status: "Ready",
    downloadUrl: toDataUrl(
      substituteLogo(
        substituteQr(
          await applyPhotoObligations(applyLegibility(flyer.html, `flyer ${flyer.id}`), unsplashPool, flyerRequest.formatId, `flyer ${flyer.id}`),
          tracking?.qrDataUrl ?? null,
        ),
        intake.brandAssets.logoUrl,
      ),
    ),
    trackingCode: tracking?.code,
  })

  if (!includeExtras) return

  try {
    const repurposed = await runRepurposeAgent(
      {
        brandProfile,
        contact: intake.contact,
        flyer: canonicalOfferFrom(flyer),
      },
      email,
    )
    assertOfferPreserved(flyer.id, flyer, repurposed)
    await updateDeliverable(email, {
      type: "flyer",
      id: flyer.id,
      repurposed: {
        instagramDownloadUrl: toDataUrl(repurposed.instagramHtml),
        instagramCaption: repurposed.instagramCaption,
        textBlurb: repurposed.textBlurb,
        nextdoorPost: repurposed.nextdoorPost,
      },
    })
    stageMark(runId, t0, "repurposing done")
  } catch (e) {
    console.error(`[agent-pipeline] Repurposing failed on retry for flyer ${flyer.id} (flyer itself is delivered):`, e)
  }
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

  const runId = flyerRequest.id
  const t0 = Date.now()
  stageMark(runId, t0, "marked in-progress")

  let attempt: Promise<void> | undefined

  try {
    attempt = runSingleFlyerRetry(runId, t0, email, intake, flyerRequest)
    await withTimeout(attempt, PIPELINE_TIMEOUT_MS)
  } catch (err) {
    const outcome = attempt ? await resolveTimeoutOutcome(attempt, err, runId) : err
    if (outcome === null) {
      await setGenerationStage(email, null)
      return
    }

    const reason = describeFailure(outcome)
    console.error("[agent-pipeline] Retry failed:", reason)
    await markFlyerFailed(email, flyerRequest.id, reason).catch((e) => console.error("[agent-pipeline] Failed to record retry failure:", e))
    await setGenerationStage(email, null)
  }
}

function fromDataUrl(dataUrl: string): string {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1)
  return Buffer.from(base64, "base64").toString("utf-8")
}

/**
 * Natural-language refinement (see POST /api/quick-prompt/refine) — a
 * targeted revision, not a from-scratch regeneration: the Flyer Agent
 * receives the CURRENT flyer's actual HTML plus the specific instruction,
 * asked to change only what was requested and leave everything else as-is.
 * The Flyer Agent itself is never modified for this — only what feeds it,
 * same principle as the whole Quick Prompt path (see runQuickPromptAgent).
 *
 * Reuses the flyer's EXISTING tracking code rather than issuing a new one
 * (unlike a full retry) — a small edit is still fundamentally the same
 * flyer, so its scan/click history should carry forward, not restart.
 */
export async function refineFlyer(
  email: string,
  brandProfile: Parameters<typeof runFlyerAgent>[0]["brandProfile"],
  contact: NormalizedIntake["contact"],
  flyerRequest: FlyerRequest,
  currentHtml: string,
  instruction: string,
  existingTrackingCode: string | undefined,
  includeRepurposing: boolean,
  /** The client's logo, so a refinement can't quietly drop it. Refine has no
   *  intake to read it from — unlike the batch and retry paths. */
  logoUrl: string | null = null,
): Promise<void> {
  await updateDeliverable(email, { type: "flyer", id: flyerRequest.id, status: "In Progress" })
  const runId = flyerRequest.id
  const t0 = Date.now()

  try {
    const flyerResult = await withTimeout(
      runFlyerAgent(
        {
          brandProfile,
          contact,
          photos: [],
          hasLogo: Boolean(logoUrl),
          flyerRequests: [
            {
              ...flyerRequest,
              notes: `This flyer already exists — here is its current HTML in full:\n\n${collapseQrToToken(currentHtml)}\n\nApply ONLY this specific change and leave everything else exactly as it is: ${instruction}`,
              // The token, so the model preserves it verbatim rather than
              // reproducing the real QR base64 it would otherwise see inline.
              qrCodeDataUrl: existingTrackingCode ? QR_PLACEHOLDER : null,
              format: formatForAgent(flyerRequest.formatId),
              // Explicitly "keep what's there" — a refinement must not
              // redesign a flyer the client has already seen.
              designVariant: PRESERVE_EXISTING_VARIANT,
            },
          ],
          batchSize: 1,
          // Split out below, same reason as runBatch: one call producing the
          // flyer AND a second HTML document AND three copy variants is what
          // blew the timeout, and a timeout here would lose the refined flyer.
          includeRepurposing: false,
        },
        email,
      ),
      PIPELINE_TIMEOUT_MS,
    )
    stageMark(runId, t0, "refinement done")

    const flyer = flyerResult.flyers[0]
    if (!flyer) throw new Error("Flyer Agent returned no result")

    if (existingTrackingCode) await backfillTrackingContent(existingTrackingCode, flyer)

    // Refinement reuses the SAME tracking code, so the same QR image goes
    // back in — regenerating it would silently invalidate any already-printed
    // copy of this flyer.
    const qrDataUrl = existingTrackingCode ? await qrDataUrlForCode(existingTrackingCode) : null

    await updateDeliverable(email, {
      type: "flyer",
      id: flyer.id,
      status: "Ready",
      downloadUrl: toDataUrl(substituteLogo(substituteQr(preservePhotoCredit(currentHtml, applyLegibility(flyer.html, `flyer ${flyer.id}`)), qrDataUrl), logoUrl)),
      trackingCode: existingTrackingCode,
    })

    if (includeRepurposing) {
      try {
        const repurposed = await runRepurposeAgent(
          { brandProfile, contact, flyer: canonicalOfferFrom(flyer) },
          email,
        )
        assertOfferPreserved(flyer.id, flyer, repurposed)
        await updateDeliverable(email, {
          type: "flyer",
          id: flyer.id,
          repurposed: {
            instagramDownloadUrl: toDataUrl(repurposed.instagramHtml),
            instagramCaption: repurposed.instagramCaption,
            textBlurb: repurposed.textBlurb,
            nextdoorPost: repurposed.nextdoorPost,
          },
        })
        stageMark(runId, t0, "repurposing done")
      } catch (e) {
        console.error(`[agent-pipeline] Repurposing failed after refinement for ${flyer.id} (refined flyer is delivered):`, e)
      }
    }
  } catch (err) {
    const reason = describeFailure(err)
    console.error("[agent-pipeline] Refinement failed:", reason)
    await markFlyerFailed(email, flyerRequest.id, reason).catch((e) => console.error("[agent-pipeline] Failed to record refinement failure:", e))
  }
}

export { fromDataUrl }
