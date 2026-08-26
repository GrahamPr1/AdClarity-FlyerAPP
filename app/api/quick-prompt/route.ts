import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { PLAN_LIMITS, QUICK_PROMPT_FORMATS, QUICK_PROMPT_STYLES } from "@/lib/types"
import type { QuickPromptFormat, QuickPromptStyle } from "@/lib/types"
import { getOrCreateClient, reserveFlyerQuota, getSavedBrandProfile } from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { continuePipelineFromIntake } from "@/lib/agent-pipeline/pipeline"
import { runQuickPromptAgent } from "@/lib/agent-pipeline/agents/quickPromptAgent"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"
import { canCreateCampaign } from "@/lib/agent-pipeline/plan-features"
import { formatIdFromLabel } from "@/lib/agent-pipeline/formats"

export const maxDuration = 300

const STYLE_TO_FONT: Record<QuickPromptStyle, NormalizedIntake["fontStylePreference"]> = {
  Bold: "modern",
  Elegant: "classic",
  Playful: "playful",
  Corporate: "modern",
  Minimal: "minimal",
}

// Format is now a first-class property of the request (formatId), expanded
// into a real structural brief at call time — see lib/agent-pipeline/
// formats.ts. It used to be a single sentence smuggled into notes, which
// produced a flyer with different words about it rather than an actual door
// hanger or proposal: same canvas, same density, same structure.
interface QuickPromptRequestBody {
  prompt?: string
  format?: QuickPromptFormat
  styleOverride?: QuickPromptStyle | null
  useSavedBrand?: boolean
  attempt?: number
  clarificationAnswer?: string
  businessName?: string
  phone?: string
  address?: string
}

// POST /api/quick-prompt
// Skips the guided flow's Intake Agent entirely — a lightweight parser
// (see lib/agent-pipeline/agents/quickPromptAgent.ts) extracts what it can
// from one free-text prompt, then feeds the SAME Brand/Flyer agents the
// guided flow uses (via the SAME continuePipelineFromIntake), unmodified.
// Basic/Pro only — Quick Prompt is a paid-plan feature, and shares the same
// monthly flyer cap as the guided flow (no separate credit pool).
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  let body: QuickPromptRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return NextResponse.json({ error: "Missing required field: prompt" }, { status: 422 })
  }
  const format: QuickPromptFormat = body.format && QUICK_PROMPT_FORMATS.includes(body.format) ? body.format : "Flyer"
  const styleOverride: QuickPromptStyle | null = body.styleOverride && QUICK_PROMPT_STYLES.includes(body.styleOverride) ? body.styleOverride : null
  const attempt = typeof body.attempt === "number" ? body.attempt : 0

  const client = await getOrCreateClient(email)

  // A paused account can still read everything it has; it just can't spend
  // more. Enforced here, server-side — the profile UI hides the button but
  // the button is not what stops it.
  const pauseCheck = canCreateCampaign(client)
  if (!pauseCheck.allowed) {
    return NextResponse.json({ error: "account_paused", message: pauseCheck.reason }, { status: 403 })
  }
  if (client.plan === "trial") {
    return NextResponse.json(
      { error: "paid_plan_required", message: "Quick Prompt is available on Basic and Pro plans — check out our plans at /#pricing." },
      { status: 403 },
    )
  }

  const planName = getPlan(client.plan)?.name ?? client.plan
  const limit = PLAN_LIMITS[client.plan]
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

  const useSavedBrand = !!body.useSavedBrand
  const savedBrand = useSavedBrand ? await getSavedBrandProfile(email) : null

  // Combines the original prompt with the client's clarification answer
  // (if this is attempt 1+) so the parser sees the full picture in one call
  // rather than needing conversation history.
  const fullPromptText = attempt > 0 && body.clarificationAnswer?.trim() ? `${prompt}\n\nAdditional detail: ${body.clarificationAnswer.trim()}` : prompt

  const parsed = await runQuickPromptAgent({ prompt: fullPromptText, format, clientBusinessCategory: client.businessCategory }, email)

  if (parsed.blocked) {
    return NextResponse.json({ error: "content_blocked", message: parsed.blockedReason ?? "This prompt can't be generated — please rephrase." }, { status: 422 })
  }

  // Only surfaces the clarifying question on the FIRST attempt — per the
  // spec, ask at most once, then proceed with best-effort data regardless.
  if (attempt === 0 && parsed.clarifyingQuestion) {
    return NextResponse.json({ needsClarification: true, question: parsed.clarifyingQuestion })
  }

  const contact: NormalizedIntake["contact"] = savedBrand
    ? savedBrand.contact
    : {
        phone: body.phone?.trim() || "",
        // Null, not "", when absent — address is optional everywhere now (see
        // the note on contact.address in lib/agent-pipeline/schemas/intake.ts).
        address: body.address?.trim() || null,
        website: null,
        social: null,
        contactName: null,
      }
  // Only the phone is genuinely needed: it's the flyer's call-to-action.
  // Requiring an address here rejected submissions the rest of the pipeline
  // is perfectly happy to build.
  if (!contact.phone) {
    return NextResponse.json(
      { error: "missing_phone", message: "Add a phone number so your flyer has a way for customers to reach you." },
      { status: 422 },
    )
  }

  const businessName = savedBrand?.brandProfile.businessName || body.businessName?.trim() || parsed.businessNameGuess || `${parsed.industry} Business`

  const voiceTonePreference = styleOverride?.toLowerCase() ?? parsed.styleCues[0]?.toLowerCase() ?? "professional"
  const fontStylePreference: NormalizedIntake["fontStylePreference"] = styleOverride ? STYLE_TO_FONT[styleOverride] : "modern"

  const flyerRequestId = crypto.randomUUID()
  const intake: NormalizedIntake = {
    businessName,
    industry: parsed.industry,
    yearsInBusiness: null,
    services: [parsed.purpose],
    targetAudience: parsed.targetAudience,
    contact,
    brandAssets: {
      logoUrl: null,
      existingColors: savedBrand ? savedBrand.brandProfile.colors.map((c) => c.hex) : null,
      existingFontsNote: savedBrand ? `Heading: ${savedBrand.brandProfile.fonts.heading}, Body: ${savedBrand.brandProfile.fonts.body}` : null,
    },
    voiceTonePreference,
    fontStylePreference,
    photos: [],
    wantsAiPhotos: false,
    // Quick Prompt has no QR question — it's the one-line path, deliberately
    // free of settings — so it keeps the long-standing default.
    wantsQrCode: true,
    flyerRequests: [
      {
        id: flyerRequestId,
        purpose: parsed.purpose,
        notes: `Client's original request: ${fullPromptText}`,
        formatId: formatIdFromLabel(format),
      },
    ],
    websitePreferences: null,
    existingMaterialsNotes: null,
    batchSize: 1,
  }

  // Atomic claim, same reasoning as /api/intake — the count read earlier in
  // this request is already stale by the time we get here.
  const reservation = await reserveFlyerQuota(email, 1, limit)
  if (!reservation.ok) {
    return NextResponse.json(
      { error: "limit_reached", message: `You've used all ${limit} flyers on your ${planName} plan — check out our plans at /#pricing for more.`, flyersCreated: reservation.flyersCreated, limit },
      { status: 402 },
    )
  }

  // Quick Prompt's inferred brand never auto-saves — see SavedBrandProfile
  // in lib/types.ts. Reuses the exact same pipeline entry point the guided
  // flow uses, so output parity (QR tracking, repurposing) is automatic,
  // not something to separately reimplement.
  waitUntil(
    continuePipelineFromIntake(email, intake, [{ id: flyerRequestId, purpose: intake.flyerRequests[0].purpose, notes: intake.flyerRequests[0].notes }], false).catch((err) => {
      console.error("[agent-pipeline] Unhandled quick-prompt pipeline error:", err)
    }),
  )

  return NextResponse.json({ ok: true, flyerId: flyerRequestId }, { status: 201 })
}
