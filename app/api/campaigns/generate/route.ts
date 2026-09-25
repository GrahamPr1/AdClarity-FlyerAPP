import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { waitUntil } from "@vercel/functions"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getOrCreateClient, getProduct, reserveFlyerQuota, saveCampaign } from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { PLAN_LIMITS } from "@/lib/types"
import { resolveBusinessProfile } from "@/lib/business-profile-resolve"
import { buildCampaignContext } from "@/lib/agent-pipeline/campaign-context"
import { continuePipelineFromIntake } from "@/lib/agent-pipeline/pipeline"
import { canCreateCampaign } from "@/lib/agent-pipeline/plan-features"
import { MIN_VARIATIONS, MAX_VARIATIONS } from "@/lib/product-profile"

/**
 * Generate 1-5 creative options for one product.
 *
 * The Phase 3 entry point. It assembles structured context (Business Profile
 * + Product Profile + creative angles) and hands it to
 * continuePipelineFromIntake — the SAME pipeline the guided flow and Quick
 * Prompt use. No second generation engine: QR tracking, photo sourcing,
 * repurposing, retry and refine all come along for free because this is the
 * same entry point, just with a better-built intake.
 *
 * One product does not equal one flyer. N variations become N flyerRequests
 * in a single batch, which is what runBatch already parallelises and what
 * assignDesignVariants already gives distinct layouts to. The genuinely new
 * part is the creative ANGLE per variation — see creative-angles.ts — so the
 * options differ in argument, not only in composition.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Not available for the admin account" }, { status: 403 })
  }
  const email = session.sub

  let body: { productId?: unknown; variations?: unknown; formatId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const productId = typeof body.productId === "string" ? body.productId : ""
  if (!productId) return NextResponse.json({ error: "Choose a product or service first." }, { status: 400 })

  const requested = Number(body.variations)
  const variations = Number.isFinite(requested)
    ? Math.min(MAX_VARIATIONS, Math.max(MIN_VARIATIONS, Math.trunc(requested)))
    : 1

  const [product, business, client] = await Promise.all([
    getProduct(email, productId),
    resolveBusinessProfile(email),
    getOrCreateClient(email),
  ])
  if (!product) return NextResponse.json({ error: "That product no longer exists." }, { status: 404 })

  // Takes the client record (it checks pausedAt), not the plan id.
  const gate = canCreateCampaign(client)
  if (!gate.allowed) {
    return NextResponse.json({ error: "plan_blocked", message: gate.reason }, { status: 403 })
  }

  const context = buildCampaignContext(business, product, {
    variations,
    formatId: typeof body.formatId === "string" ? body.formatId : undefined,
    ids: Array.from({ length: variations }, () => randomUUID()),
  })
  if (!context.ok) {
    return NextResponse.json({ error: context.reason, message: context.message }, { status: 400 })
  }

  // Atomic claim of N, not 1 — the same reasoning as /api/intake, and it has
  // to cover the whole batch or a client could exceed their plan by asking
  // for five options with one flyer of headroom left.
  const limit = PLAN_LIMITS[client.plan]
  const planName = getPlan(client.plan)?.name ?? client.plan
  const reservation = await reserveFlyerQuota(email, variations, limit)
  if (!reservation.ok) {
    const remaining = Math.max(0, limit - reservation.flyersCreated)
    return NextResponse.json(
      {
        error: "limit_reached",
        message:
          remaining > 0
            ? `You have ${remaining} flyer${remaining === 1 ? "" : "s"} left on your ${planName} plan — choose ${remaining} option${remaining === 1 ? "" : "s"} or fewer.`
            : `You've used all ${limit} flyers on your ${planName} plan — see /#pricing for more.`,
        flyersCreated: reservation.flyersCreated,
        limit,
        remaining,
      },
      { status: 402 },
    )
  }

  const requests = context.intake.flyerRequests.map((r) => ({
    id: r.id,
    purpose: r.purpose,
    notes: r.notes,
    ...(r.formatId ? { formatId: r.formatId } : {}),
  }))

  // The campaign record is written BEFORE generation starts, not after.
  // Generation is fire-and-forget (waitUntil) and can fail per-flyer; the
  // grouping is what lets the dashboard show those failures together and
  // offer "see the other options", so it has to exist even if every
  // variation fails.
  const campaignId = randomUUID()
  const angleByFlyerId: Record<string, string> = {}
  requests.forEach((r, i) => {
    angleByFlyerId[r.id] = context.angles[i]?.name ?? context.angles[0]?.name ?? "Straightforward"
  })
  await saveCampaign(email, {
    id: campaignId,
    createdAt: new Date().toISOString(),
    productId: product.id,
    // Captured now: renaming or deleting the product later must not rewrite
    // what this campaign was for.
    productName: product.name,
    flyerIds: requests.map((r) => r.id),
    angles: requests.map((r) => ({ flyerId: r.id, angle: angleByFlyerId[r.id] })),
    ...(typeof body.formatId === "string" ? { formatId: body.formatId } : {}),
  })

  waitUntil(
    continuePipelineFromIntake(email, context.intake, requests, false, { id: campaignId, angleByFlyerId }).catch((err) => {
      console.error("[agent-pipeline] Unhandled campaign-generate pipeline error:", err)
    }),
  )

  return NextResponse.json(
    {
      ok: true,
      campaignId,
      flyerIds: requests.map((r) => r.id),
      variations,
      angles: context.angles.map((a) => ({ id: a.id, name: a.name })),
    },
    { status: 201 },
  )
}
