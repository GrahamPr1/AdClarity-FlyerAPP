import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { PLAN_LIMITS } from "@/lib/types"
import { getOrCreateClient, reserveFlyerQuota, seedFlyerDeliverables, updateDeliverable, markFlyerFailed, setGenerationStage } from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { canCreateCampaign } from "@/lib/agent-pipeline/plan-features"
import { runColoringAgent } from "@/lib/agent-pipeline/agents/coloringAgent"
import { ColoringPageRequestSchema } from "@/lib/agent-pipeline/schemas/coloring"
import { toDataUrl } from "@/lib/agent-pipeline/flyer-html"

export const maxDuration = 300

// POST /api/coloring-page
//
// A standalone product, not a flyer format. It shares the account, the
// dashboard and the monthly allowance — one coloring page costs one campaign
// credit, same as a flyer — but nothing else: no brand profile, no Intake or
// Brand agent, no QR code, no repurposing. The intake questions are about
// what to DRAW, which have nothing in common with the business-flyer ones.
//
// Available on every plan. The allowance is the limit, not the tier: a
// teacher on the free tier is exactly the audience this exists for, and
// gating it behind Basic would put it out of reach of most of them.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = ColoringPageRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Tell us what the coloring page should show." },
      { status: 422 },
    )
  }

  const client = await getOrCreateClient(email)

  const pauseCheck = canCreateCampaign(client)
  if (!pauseCheck.allowed) {
    return NextResponse.json({ error: "account_paused", message: pauseCheck.reason }, { status: 403 })
  }

  // Same atomic claim every other generating route uses — a coloring page
  // consumes one credit from the same monthly pool as a flyer.
  const limit = PLAN_LIMITS[client.plan]
  const reservation = await reserveFlyerQuota(email, 1, limit)
  if (!reservation.ok) {
    const planName = getPlan(client.plan)?.name ?? client.plan
    return NextResponse.json(
      {
        error: "limit_reached",
        message: `You've used all ${limit} campaigns on your ${planName} plan — they reset monthly.`,
        flyersCreated: reservation.flyersCreated,
        limit,
      },
      { status: 402 },
    )
  }

  const id = crypto.randomUUID()
  const provisionalTitle = parsed.data.subject.slice(0, 60)
  await seedFlyerDeliverables(email, [{ id, purpose: provisionalTitle }])

  waitUntil(
    (async () => {
      try {
        await setGenerationStage(email, "Drawing your coloring page")
        await updateDeliverable(email, { type: "flyer", id, status: "In Progress" })
        const result = await runColoringAgent(parsed.data, email)
        await updateDeliverable(email, {
          type: "flyer",
          id,
          title: result.page.title,
          status: "Ready",
          downloadUrl: toDataUrl(result.page.html),
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Generation failed"
        console.error("[coloring-page] Generation failed:", reason)
        await markFlyerFailed(email, id, reason).catch(() => {})
      } finally {
        await setGenerationStage(email, null)
      }
    })(),
  )

  return NextResponse.json({ ok: true, id })
}
