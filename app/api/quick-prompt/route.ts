import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { PLAN_LIMITS, QUICK_PROMPT_FORMATS, QUICK_PROMPT_STYLES } from "@/lib/types"
import type { QuickPromptFormat, QuickPromptStyle } from "@/lib/types"
import { getOrCreateClient, incrementFlyersCreated, getSavedBrandProfile } from "@/lib/store"
import { getPlan } from "@/lib/plans"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { continuePipelineFromIntake } from "@/lib/agent-pipeline/pipeline"
import { runQuickPromptAgent } from "@/lib/agent-pipeline/agents/quickPromptAgent"
import type { NormalizedIntake } from "@/lib/agent-pipeline/schemas/intake"

export const maxDuration = 300

const STYLE_TO_FONT: Record<QuickPromptStyle, NormalizedIntake["fontStylePreference"]> = {
  Bold: "modern",
  Elegant: "classic",
  Playful: "playful",
  Corporate: "modern",
  Minimal: "minimal",
}

// The Flyer Agent's own prompt has no concept of "format" and is
// deliberately never changed (see the spec's own "do not change those
// agents" instruction) — so format is conveyed the only way this path can
// reach it without a prompt change: as an explicit, directive instruction
// inside FlyerRequest.notes, which the agent already reads for real
// context (confirmed by earlier real runs picking up "mention $50 off
// first cleaning" style detail straight out of notes).
const FORMAT_GUIDANCE: Record<QuickPromptFormat, string> = {
  Flyer: "Format requested: a standard single-page print flyer — graphic-forward, brief copy.",
  "One-Pager": "Format requested: a One-Pager — more written detail than a flyer, organized into a few clear sections, still single-page.",
  Proposal: "Format requested: a Proposal — text-forward with multiple clearly labeled sections (e.g. overview, scope, pricing/next steps), light on decorative graphics, longer copy than a flyer.",
  "Door Hanger": "Format requested: a Door Hanger — narrow vertical layout, very brief copy, large legible type, minimal text since it's read in a few seconds.",
  "Social Post": "Format requested: a Social Post — square-friendly layout, short punchy copy, bold visual focus, no print-specific elements like a mailing disclaimer footer.",
}

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
        address: body.address?.trim() || "",
        website: null,
        social: null,
        contactName: null,
      }
  if (!contact.phone || !contact.address) {
    return NextResponse.json({ error: "Missing required fields: phone, address (or use your saved brand)" }, { status: 422 })
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
    flyerRequests: [{ id: flyerRequestId, purpose: parsed.purpose, notes: `${FORMAT_GUIDANCE[format]}\n\nClient's original request: ${fullPromptText}` }],
    websitePreferences: null,
    existingMaterialsNotes: null,
    batchSize: 1,
  }

  const remaining = limit - client.flyersCreated
  if (remaining < 1) {
    return NextResponse.json(
      { error: "limit_reached", message: `You've used all ${limit} flyers on your ${planName} plan — check out our plans at /#pricing for more.`, flyersCreated: client.flyersCreated, limit },
      { status: 402 },
    )
  }

  await incrementFlyersCreated(email, 1)

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
