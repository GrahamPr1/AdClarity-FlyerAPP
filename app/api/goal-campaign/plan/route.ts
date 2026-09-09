import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getOrCreateClient, savePendingGoalCampaign } from "@/lib/store"
import { canCreateCampaign } from "@/lib/agent-pipeline/plan-features"
import { parseMarketingGoal, GoalTooVagueError } from "@/lib/agent-pipeline/goal-parser"
import { buildGoalCampaignPlan, OfferRequiredError } from "@/lib/agent-pipeline/goal-campaign"
import { checkGoalRateLimit } from "@/lib/agent-pipeline/goal-rate-limit"
import { AgentRefusalError } from "@/lib/agent-pipeline/client"

// POST /api/goal-campaign/plan
//
// Step one of two. Parses a plain-language goal, assembles the campaign, and
// returns it FOR REVIEW. Generates nothing and consumes no flyer quota.
//
// The assembled intake is stored server-side and the caller gets only an
// opaque planId — see savePendingGoalCampaign for why the object must never
// round-trip through the client.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  const rate = await checkGoalRateLimit(email, "parse")
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "That's a lot of plans in one go — try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    )
  }

  let body: { goal?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (typeof body.goal !== "string" || !body.goal.trim()) {
    return NextResponse.json({ error: "Missing required field: goal" }, { status: 422 })
  }

  const client = await getOrCreateClient(email)

  const pauseCheck = canCreateCampaign(client)
  if (!pauseCheck.allowed) {
    return NextResponse.json({ error: "account_paused", message: pauseCheck.reason }, { status: 403 })
  }
  // Same gate as Quick Prompt: this reaches the identical paid pipeline, so
  // it can't be a free-tier way in.
  if (client.plan === "trial") {
    return NextResponse.json(
      { error: "paid_plan_required", message: "Goal-based campaigns are available on Basic and Pro plans — see /#pricing." },
      { status: 403 },
    )
  }

  try {
    const { parsed, usedBusinessContext } = await parseMarketingGoal({ goal: body.goal, email })
    const plan = await buildGoalCampaignPlan({ goal: parsed, email })
    const planId = crypto.randomUUID()
    await savePendingGoalCampaign(email, planId, plan)

    // A readable summary, not the intake. Enough to decide on; nothing the
    // execute step will trust back.
    return NextResponse.json({
      ok: true,
      planId,
      usedBusinessContext,
      needsPhone: plan.needsPhone,
      plan: {
        goal: parsed.goal,
        time_period: parsed.time_period,
        primary_offer: parsed.primary_offer,
        target_audience: plan.intake.targetAudience,
        suggested_channels: parsed.suggested_channels,
        format: plan.formatId,
        businessName: plan.intake.businessName,
        includesQrCode: plan.intake.wantsQrCode,
      },
    })
  } catch (err) {
    if (err instanceof OfferRequiredError) {
      return NextResponse.json({ error: "offer_required", message: err.message }, { status: 422 })
    }
    if (err instanceof GoalTooVagueError) {
      return NextResponse.json({ error: "goal_too_vague", message: err.message }, { status: 422 })
    }
    if (err instanceof AgentRefusalError) {
      return NextResponse.json(
        { error: "goal_rejected", message: "We couldn't read that as a business goal — try describing what you want to achieve." },
        { status: 422 },
      )
    }
    console.error("[goal-campaign] Failed to build plan:", err)
    return NextResponse.json({ error: "plan_failed", message: "We couldn't build that plan just now — please try again in a moment." }, { status: 500 })
  }
}
