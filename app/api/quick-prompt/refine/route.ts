import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { PLAN_LIMITS } from "@/lib/types"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import {
  getDeliverablesForEmail,
  getPipelineState,
  getPendingBrandProfile,
  getSavedBrandProfile,
  getOrCreateClient,
  incrementFlyersCreated,
  incrementAndCheckRefinementAllowance,
} from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { refineFlyer, fromDataUrl } from "@/lib/agent-pipeline/pipeline"

export const maxDuration = 300

// POST /api/quick-prompt/refine
// Natural-language post-generation edit — "make the headline bigger",
// "use blue instead of green" — applied as a targeted revision (see
// refineFlyer in lib/agent-pipeline/pipeline.ts), not a full regeneration.
// Works for guided-flow flyers too, not just Quick Prompt (per the spec's
// own "after a Quick Prompt (or guided) generation"). First 3 refinements
// per flyerId within an hour are free; the 4th+ consumes a real credit —
// enforced server-side, same policy shape as /api/quick-prompt/regenerate.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  let body: { flyerId?: string; instruction?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const flyerId = body.flyerId?.trim()
  const instruction = body.instruction?.trim()
  if (!flyerId || !instruction) {
    return NextResponse.json({ error: "Missing required fields: flyerId, instruction" }, { status: 422 })
  }

  const deliverables = await getDeliverablesForEmail(email)
  const flyer = deliverables.flyers.find((f) => f.id === flyerId)
  if (!flyer || !flyer.downloadUrl) {
    return NextResponse.json({ error: "Flyer not found or not ready yet" }, { status: 404 })
  }

  // Brand context: the scratch-saved one from THIS generation (Quick
  // Prompt) if it's still around, else the client's real saved brand
  // (guided-flow flyers always have one, since guided auto-saves it).
  const pending = await getPendingBrandProfile(flyerId)
  const brandSource = pending ?? (await getSavedBrandProfile(email))
  if (!brandSource) {
    return NextResponse.json({ error: "not_available", message: "This flyer's brand details are no longer available to refine from." }, { status: 404 })
  }

  const pipelineState = await getPipelineState(email)
  const originalRequest = pipelineState?.flyerRequests.find((r) => r.id === flyerId)
  const flyerRequest = originalRequest ?? { id: flyerId, purpose: flyer.title, notes: null }

  const { isFree, countSoFar } = await incrementAndCheckRefinementAllowance(flyerId)

  const client = await getOrCreateClient(email)
  if (!isFree) {
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

  const currentHtml = fromDataUrl(flyer.downloadUrl)
  const includeRepurposing = client.plan !== "trial"

  waitUntil(
    refineFlyer(email, brandSource.brandProfile, brandSource.contact, flyerRequest, currentHtml, instruction, flyer.trackingCode, includeRepurposing).catch((err) => {
      console.error("[agent-pipeline] Unhandled refinement error:", err)
    }),
  )

  return NextResponse.json({ ok: true, isFree, countSoFar })
}
