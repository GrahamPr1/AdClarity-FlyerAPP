import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { PLAN_LIMITS } from "@/lib/types"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getPipelineState, getOrCreateClient, incrementFlyersCreated, incrementAndCheckRegenerateAllowance } from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { retryFlyer } from "@/lib/agent-pipeline/pipeline"

export const maxDuration = 300

// POST /api/quick-prompt/regenerate
// "Try Again" — re-runs the SAME prompt/settings so the AI can produce a
// different interpretation, per the spec. Reuses the exact same underlying
// mechanism as the general /api/deliverables/retry (retryFlyer against the
// last saved pipeline state), but layers a real, server-side free-attempt
// policy on top: the first 2 regenerate calls for a given flyerId within a
// 10-minute window are free; the 3rd+ consumes a real plan credit — never
// trust a client-reported attempt count for this.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  let body: { flyerId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const flyerId = body.flyerId?.trim()
  if (!flyerId) {
    return NextResponse.json({ error: "Missing required field: flyerId" }, { status: 422 })
  }

  const pipelineState = await getPipelineState(email)
  const flyerRequest = pipelineState?.flyerRequests.find((r) => r.id === flyerId)
  if (!pipelineState || !flyerRequest) {
    return NextResponse.json({ error: "nothing_to_retry", message: "No saved data to regenerate from — please submit a new request instead." }, { status: 422 })
  }

  const { isFree, countSoFar } = await incrementAndCheckRegenerateAllowance(flyerId)

  if (!isFree) {
    const client = await getOrCreateClient(email)
    const planName = getPlan(client.plan)?.name ?? client.plan
    const limit = PLAN_LIMITS[client.plan]
    if (client.flyersCreated >= limit) {
      return NextResponse.json(
        { error: "limit_reached", message: `You've used all ${limit} flyers on your ${planName} plan — check out our plans at /#pricing for more.`, flyersCreated: client.flyersCreated, limit },
        { status: 402 },
      )
    }
    await incrementFlyersCreated(email, 1)
  }

  waitUntil(
    retryFlyer(email, pipelineState.intake, flyerRequest).catch((err) => {
      console.error("[agent-pipeline] Unhandled regenerate error:", err)
    }),
  )

  return NextResponse.json({ ok: true, isFree, countSoFar })
}
