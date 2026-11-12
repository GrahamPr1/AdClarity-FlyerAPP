import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { waitUntil } from "@vercel/functions"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { nopAgentGenerationBlock } from "@/lib/enterprise/generation-guard"
import { getAgentProfile, getDeliverablesForEmail, getOrCreateClient, reserveFlyerQuota } from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { PLAN_LIMITS } from "@/lib/types"
import { resolveBusinessProfile } from "@/lib/business-profile-resolve"
import { buildCampaignContext } from "@/lib/agent-pipeline/campaign-context"
import { continuePipelineFromIntake } from "@/lib/agent-pipeline/pipeline"
import { canCreateCampaign } from "@/lib/agent-pipeline/plan-features"
import { emptyProduct } from "@/lib/product-profile"
import { getCampaignInput } from "@/lib/campaign-inputs"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"

/**
 * Pro: "New promotion from this campaign". One new flyer that reuses what an
 * existing flyer was made from — business, brand, photos, format — with a
 * new offer. It goes through the same pipeline and the same quota as every
 * other flyer; only the intake is pre-filled.
 *
 * Flyers made before per-campaign inputs were saved (campaign-inputs.ts) have
 * nothing to reuse, so those fall back to the saved Business Profile as a
 * standard flyer, and GET reports source "profile" so the UI can say so.
 *
 * Gated server-side: Pro only, never enterprise org accounts or NOP agents.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_OFFER = 300
const MAX_NOTES = 1000

type Source = "campaign" | "profile"

type Gate = { ok: true; email: string } | { ok: false; res: NextResponse }

async function gate(req: NextRequest): Promise<Gate> {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.sub === ADMIN_SUB) {
    return { ok: false, res: NextResponse.json({ error: "Not available for the admin account" }, { status: 403 }) }
  }
  const email = session.sub
  const nopBlock = await nopAgentGenerationBlock(email, req)
  if (nopBlock) return { ok: false, res: nopBlock }
  if ((await getAgentProfile(email).catch(() => null))?.orgId) {
    return { ok: false, res: NextResponse.json({ error: "not_available", message: "Not available on this account." }, { status: 403 }) }
  }
  const client = await getOrCreateClient(email)
  if (client.plan !== "pro") {
    return {
      ok: false,
      res: NextResponse.json({ error: "pro_only", message: "New promotion from a campaign is part of Pro." }, { status: 403 }),
    }
  }
  const allowed = canCreateCampaign(client)
  if (!allowed.allowed) {
    return { ok: false, res: NextResponse.json({ error: "plan_blocked", message: allowed.reason }, { status: 403 }) }
  }
  return { ok: true, email }
}

/** The flyer must be one of the caller's own. */
async function ownsFlyer(email: string, flyerId: string): Promise<boolean> {
  if (!flyerId) return false
  const deliverables = await getDeliverablesForEmail(email)
  return deliverables.flyers.some((f) => f.id === flyerId)
}

export async function GET(req: NextRequest) {
  const g = await gate(req)
  if (!g.ok) return g.res
  const flyerId = req.nextUrl.searchParams.get("flyerId") ?? ""
  if (!(await ownsFlyer(g.email, flyerId))) return NextResponse.json({ error: "Flyer not found" }, { status: 404 })
  const source: Source = (await getCampaignInput(flyerId)) ? "campaign" : "profile"
  return NextResponse.json({ available: true, source })
}

export async function POST(req: NextRequest) {
  const g = await gate(req)
  if (!g.ok) return g.res
  const email = g.email

  let body: { flyerId?: unknown; offer?: unknown; notes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
  const flyerId = typeof body.flyerId === "string" ? body.flyerId : ""
  const offer = typeof body.offer === "string" ? body.offer.trim() : ""
  const notes = typeof body.notes === "string" ? body.notes.trim() : ""
  if (!offer) return NextResponse.json({ error: "missing_offer", message: "Say what the new promotion is." }, { status: 400 })
  if (offer.length > MAX_OFFER) {
    return NextResponse.json({ error: "offer_too_long", message: `Keep the promotion to ${MAX_OFFER} characters.` }, { status: 400 })
  }
  if (notes.length > MAX_NOTES) {
    return NextResponse.json({ error: "notes_too_long", message: `Keep the notes to ${MAX_NOTES} characters.` }, { status: 400 })
  }
  if (!(await ownsFlyer(email, flyerId))) return NextResponse.json({ error: "Flyer not found" }, { status: 404 })

  const id = randomUUID()
  let intake: NormalizedIntake
  let source: Source
  const saved = await getCampaignInput(flyerId)
  if (saved) {
    source = "campaign"
    // The old request's notes are NOT carried over: they can state the old
    // offer ("OFFER (use verbatim)…"), which would contradict the new one.
    const request = {
      id,
      purpose: offer,
      notes: notes || null,
      ...(saved.request.formatId ? { formatId: saved.request.formatId } : {}),
    }
    intake = { ...saved.intake, flyerRequests: [request] }
  } else {
    source = "profile"
    const product = { ...emptyProduct(id, offer), offer, ...(notes ? { description: notes } : {}) }
    const context = buildCampaignContext(await resolveBusinessProfile(email), product, { variations: 1, ids: [id] })
    if (!context.ok) return NextResponse.json({ error: context.reason, message: context.message }, { status: 400 })
    intake = context.intake
  }

  const client = await getOrCreateClient(email)
  const limit = PLAN_LIMITS[client.plan]
  const reservation = await reserveFlyerQuota(email, 1, limit)
  if (!reservation.ok) {
    const planName = getPlan(client.plan)?.name ?? client.plan
    return NextResponse.json(
      {
        error: "limit_reached",
        message: `You've used all ${limit} flyers on your ${planName} plan this period.`,
        flyersCreated: reservation.flyersCreated,
        limit,
        remaining: 0,
      },
      { status: 402 },
    )
  }

  const requests = intake.flyerRequests.map((r) => ({
    id: r.id,
    purpose: r.purpose,
    notes: r.notes,
    ...(r.formatId ? { formatId: r.formatId } : {}),
  }))
  waitUntil(
    continuePipelineFromIntake(email, intake, requests, false).catch((err) => {
      console.error("[agent-pipeline] Unhandled new-promotion pipeline error:", err)
    }),
  )

  return NextResponse.json({ ok: true, flyerId: id, source }, { status: 201 })
}
