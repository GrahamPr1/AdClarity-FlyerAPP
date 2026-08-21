import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import type { IntakeSubmission } from "@/lib/types"
import { PLAN_LIMITS, BUSINESS_CATEGORIES } from "@/lib/types"
import { saveIntake, getOrCreateClient, reserveFlyerQuota, setClientBusinessCategory, setClientBusinessName } from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { continuePipelineFromIntake, runIntakeStage, MAX_FLYERS_PER_BATCH } from "@/lib/agent-pipeline/pipeline"

// The pipeline continues running after the response via waitUntil() below —
// explicitly claim the full 300s Vercel now defaults to on Fluid Compute,
// rather than depending on that default implicitly, since the pipeline's own
// internal ceiling (PIPELINE_TIMEOUT_MS, see lib/agent-pipeline/pipeline.ts)
// is set just under this and needs the platform to actually allow it.
export const maxDuration = 300

// POST /api/intake
// Accepts the onboarding IntakeSubmission, validates required fields,
// enforces the client's plan flyer limit (see PLAN_LIMITS), and hands off
// to the agent pipeline. Requires a signed-in session — onboarding happens
// AFTER login now (see app/onboarding/page.tsx), so this is defense in
// depth against a raw POST bypassing that, not just a UI-level lock.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: IntakeSubmission
  try {
    body = (await request.json()) as IntakeSubmission
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Basic validation of required fields.
  const missing: string[] = []
  if (!body.contact?.email?.trim()) missing.push("email")
  if (!body.businessCategory) missing.push("businessCategory")
  if (!body.businessName?.trim()) missing.push("businessName")
  if (!body.industry?.trim()) missing.push("industry")
  if (!body.services || body.services.length === 0) missing.push("services")
  if (!body.targetAudience?.trim()) missing.push("targetAudience")

  if (missing.length > 0) {
    return NextResponse.json({ error: "Missing required fields", missing }, { status: 422 })
  }

  // A closed set, not free text — reject anything that isn't one of the
  // onboarding UI's own options rather than silently storing garbage a
  // hand-crafted request could send.
  if (!BUSINESS_CATEGORIES.includes(body.businessCategory)) {
    return NextResponse.json({ error: `businessCategory must be one of: ${BUSINESS_CATEGORIES.join(", ")}` }, { status: 422 })
  }

  const email = body.contact.email.trim().toLowerCase()

  // A client session may only ever submit as their own authenticated
  // email — admin may submit on behalf of any email, same allowance as
  // /api/deliverables/retry, since there's no "own" email for admin.
  if (session.sub !== ADMIN_SUB && session.sub !== email) {
    return NextResponse.json({ error: "Forbidden — you can only submit for your own signed-in email" }, { status: 403 })
  }

  // -------------------------------------------------------------------------
  // PLAN LIMIT — checked BEFORE running any part of the pipeline.
  //
  // This is a first-pass check using the client's current count. It can't
  // yet account for how many flyers THIS submission will generate — that
  // isn't known until the Intake Agent normalizes flyerNotes into
  // flyerRequests below — but it cheaply rejects clients who are already at
  // or past their plan's limit without spending anything on Intake.
  // -------------------------------------------------------------------------
  let client = await getOrCreateClient(email)
  const planName = getPlan(client.plan)?.name ?? client.plan
  const limit = PLAN_LIMITS[client.plan]

  // Real segmentation tag, written directly to the ClientRecord — never
  // touched by the agent pipeline (see buildRawIntakePayload in
  // lib/agent-pipeline/pipeline.ts), same treatment as plan. A client can
  // resubmit onboarding more than once; each submission's category
  // overwrites the last, since it's meant to reflect their current answer,
  // not a first-write-wins fact.
  await setClientBusinessCategory(email, body.businessCategory)
  await setClientBusinessName(email, body.businessName)

  if (client.flyersCreated >= limit) {
    return NextResponse.json(
      {
        error: "limit_reached",
        message: `You've used all ${limit} flyers on your ${planName} plan — check out our plans at /#pricing for more.`,
        flyersCreated: client.flyersCreated,
        limit,
      },
      { status: 402 },
    )
  }

  const saved = await saveIntake(body)

  // Run Intake now (awaited) — the real flyer count for THIS submission
  // isn't known until this normalizes flyerNotes into flyerRequests, and
  // the limit can't be enforced accurately without that number.
  const intakeResult = await runIntakeStage(saved)

  if (intakeResult.status === "needs_clarification") {
    return NextResponse.json(
      {
        error: "needs_clarification",
        missingFields: intakeResult.missingFields,
        clarifyingQuestions: intakeResult.clarifyingQuestions,
      },
      { status: 422 },
    )
  }

  const intake = intakeResult.data
  if (!intake) {
    return NextResponse.json({ error: "Intake processing failed unexpectedly" }, { status: 500 })
  }

  // Re-ids each request with a globally-unique id before it touches
  // deliverable storage. The Intake Agent numbers requests "flyer-1",
  // "flyer-2", ... starting fresh for every batch — fine within one
  // submission, but a client's flyers now accumulate across ALL their
  // submissions on one dashboard (see saveIntake in lib/store.ts), so a
  // second submission's "flyer-1" would collide with the first's.
  const flyerRequests = intake.flyerRequests.slice(0, MAX_FLYERS_PER_BATCH).map((r) => ({ ...r, id: crypto.randomUUID() }))
  const flyerCount = flyerRequests.length

  // -------------------------------------------------------------------------
  // PLAN LIMIT — the real check, now that flyerCount is known.
  //
  // Rejects the WHOLE submission (not a partial batch) if it would push the
  // client over their plan's limit, so a submission that would start 3
  // flyers can't slip through with only 2 remaining.
  // -------------------------------------------------------------------------
  // Claim the quota atomically rather than comparing against the count read
  // before the Intake Agent ran (~20-30s ago) and incrementing afterwards —
  // that gap let two concurrent submissions both pass the same stale check.
  // reserveFlyerQuota increments first and rolls back if it overshoots, so
  // the claim IS the decision.
  const reservation = await reserveFlyerQuota(email, flyerCount, limit)
  if (!reservation.ok) {
    return NextResponse.json(
      {
        error: "limit_reached",
        message:
          reservation.remaining > 0
            ? `This submission would create ${flyerCount} flyers, but you only have ${reservation.remaining} flyer${reservation.remaining === 1 ? "" : "s"} left on your ${planName} plan. Check out our plans at /#pricing for more.`
            : `You've used all ${limit} flyers on your ${planName} plan — check out our plans at /#pricing for more.`,
        flyersCreated: reservation.flyersCreated,
        limit,
        remaining: reservation.remaining,
        requested: flyerCount,
      },
      { status: 402 },
    )
  }

  // -------------------------------------------------------------------------
  // HANDOFF POINT TO THE AGENT PIPELINE (Brand + Flyer stages).
  //
  // Not awaited, so the client gets its response as soon as the limit check
  // clears rather than waiting on however long Brand -> Flyer takes — but
  // wrapped in waitUntil() so Vercel's runtime keeps this function instance
  // alive until the pipeline actually finishes, instead of potentially
  // freezing/reclaiming it right after the response is sent (which would
  // silently kill generation mid-run with no error and no state update —
  // exactly what left flyers stuck "In Progress" forever before this).
  // Progress is reported via lib/store.ts's updateDeliverable, called
  // directly by the in-process pipeline.
  // -------------------------------------------------------------------------
  waitUntil(
    continuePipelineFromIntake(email, intake, flyerRequests).catch((err) => {
      console.error("[agent-pipeline] Unhandled pipeline error:", err)
    }),
  )

  return NextResponse.json({ ok: true, submittedAt: saved.submittedAt, flyerCount }, { status: 201 })
}
