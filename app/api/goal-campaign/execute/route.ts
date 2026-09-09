import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { PLAN_LIMITS } from "@/lib/types"
import {
  getOrCreateClient,
  reserveFlyerQuota,
  getPendingGoalCampaign,
  deletePendingGoalCampaign,
  savePendingGoalCampaign,
} from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { canCreateCampaign } from "@/lib/agent-pipeline/plan-features"
import { continuePipelineFromIntake } from "@/lib/agent-pipeline/pipeline"
import { checkGoalRateLimit } from "@/lib/agent-pipeline/goal-rate-limit"
import { nonEmpty } from "@/lib/agent-pipeline/profile-defaults"

// POST /api/goal-campaign/execute
//
// Step two of two: the client approved the plan, so generate it.
//
// The intake is loaded from the server-held plan, NOT from the request — the
// body carries a planId and, optionally, a phone number. Nothing else about
// the campaign is client-controllable at this point, which is the whole
// reason the plan is stored rather than round-tripped.
//
// Everything downstream is the existing pipeline, unchanged: same quota
// reservation as /api/intake and Quick Prompt, same continuePipelineFromIntake,
// so QR tracking, repurposing and plan gating all behave identically.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  const rate = await checkGoalRateLimit(email, "execute")
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many campaigns started at once — try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    )
  }

  let body: { planId?: unknown; phone?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (typeof body.planId !== "string" || !body.planId.trim()) {
    return NextResponse.json({ error: "Missing required field: planId" }, { status: 422 })
  }

  // Keyed by email as well as id, so a guessed planId can't reach another
  // account's plan — it simply isn't found.
  const plan = await getPendingGoalCampaign(email, body.planId)
  if (!plan) {
    return NextResponse.json(
      { error: "plan_not_found", message: "That plan has expired or was already used — build it again to review the latest version." },
      { status: 404 },
    )
  }

  const client = await getOrCreateClient(email)
  const pauseCheck = canCreateCampaign(client)
  if (!pauseCheck.allowed) {
    return NextResponse.json({ error: "account_paused", message: pauseCheck.reason }, { status: 403 })
  }
  if (client.plan === "trial") {
    return NextResponse.json(
      { error: "paid_plan_required", message: "Goal-based campaigns are available on Basic and Pro plans — see /#pricing." },
      { status: 403 },
    )
  }

  // A phone is the flyer's whole call to action, and nothing in a saved
  // Business Profile carries one (CampaignDefaults has no phone field), so a
  // client who has never run a guided campaign has to supply it here.
  const phone = nonEmpty(typeof body.phone === "string" ? body.phone : null) ?? nonEmpty(plan.intake.contact.phone)
  if (!phone) {
    return NextResponse.json(
      { error: "missing_phone", message: "Add a phone number so your flyer has a way for customers to reach you." },
      { status: 422 },
    )
  }
  const intake = { ...plan.intake, contact: { ...plan.intake.contact, phone } }

  const planName = getPlan(client.plan)?.name ?? client.plan
  const limit = PLAN_LIMITS[client.plan]
  const reservation = await reserveFlyerQuota(email, 1, limit)
  if (!reservation.ok) {
    return NextResponse.json(
      {
        error: "limit_reached",
        message: `You've used all ${limit} flyers on your ${planName} plan — see /#pricing for more.`,
        flyersCreated: reservation.flyersCreated,
        limit,
      },
      { status: 402 },
    )
  }

  // Consumed on success so one approval can't be replayed into several
  // flyers. Deleted only AFTER the quota reservation succeeds — a plan
  // rejected for being over the limit is still worth keeping for an hour.
  await deletePendingGoalCampaign(email, body.planId).catch(() => {})

  const flyerRequest = intake.flyerRequests[0]

  // autoSaveBrandProfile is false, matching Quick Prompt: a brand inferred
  // without the client filling in the real form is a weaker signal than one
  // they gave us, and must not silently overwrite their saved brand.
  waitUntil(
    continuePipelineFromIntake(
      email,
      intake,
      [{ id: flyerRequest.id, purpose: flyerRequest.purpose, notes: flyerRequest.notes }],
      false,
    ).catch(async (err) => {
      console.error("[agent-pipeline] Unhandled goal-campaign pipeline error:", err)
      // Put the plan back so an infrastructure failure doesn't cost the
      // client their approval as well as their quota.
      await savePendingGoalCampaign(email, body.planId as string, plan).catch(() => {})
    }),
  )

  return NextResponse.json({ ok: true, flyerId: flyerRequest.id, format: plan.formatId }, { status: 201 })
}
