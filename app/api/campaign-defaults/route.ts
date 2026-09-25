import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getCampaignDefaults, saveCampaignDefaults, deleteCampaignDefaults, getCanonicalProfile } from "@/lib/store"
import type { BrandStyle } from "@/lib/types"

// GET/POST /api/campaign-defaults — a client's own reusable brand + contact
// answers (see CampaignDefaults in lib/types.ts). Always scoped to the
// session's own email; there is deliberately no `email` parameter, so there's
// nothing here for one client to point at another's record.
//
// Distinct from /api/business-profile (form-fill's saved file/link source)
// and /api/brand-profile (the Brand Agent's AI-inferred output). This one is
// the client's own raw answers, collected AFTER their first campaign so it
// never stands between a new signup and their first flyer.

const STYLES: BrandStyle[] = ["modern", "classic", "playful", "minimal"]

/** Trimmed and length-capped: these are free text that ends up in an AI prompt and, for several fields, printed on a flyer. */
function clean(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

/**
 * Same discipline as clean(), for the one list-valued field (pastOffers).
 * Bounded on BOTH axes on purpose: this is client-supplied and ends up
 * inside an AI prompt, so an unbounded array is an unbounded token bill and
 * a lever for shoving arbitrary text at the model. Drops blanks and
 * case-insensitive duplicates so the list stays a list of distinct offers.
 */
const MAX_PAST_OFFERS = 20
const MAX_PAST_OFFER_LEN = 120

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const s = clean(item, MAX_PAST_OFFER_LEN)
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= MAX_PAST_OFFERS) break
  }
  return out
}

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ defaults: await getCampaignDefaults(session.sub) })
}

export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Every field is genuinely optional — this whole record is a
  // nice-to-have, so an empty save is valid and simply clears the defaults
  // rather than being rejected.
  const style = clean(body.preferredStyle) as BrandStyle

  // website / address / voiceTone / brandColors are NOT read from the body.
  //
  // They describe the same facts as the canonical business profile, which is
  // now the only place they are edited (BusinessProfileForm). Two live
  // writers for one fact is last-one-wins with no coordination: saving this
  // form would quietly revert a phone or a website the client had just
  // corrected on the other one.
  //
  // They are carried through from the EXISTING record rather than dropped,
  // because resolveBusinessProfile still backfills from them for accounts
  // that predate the canonical profile. Writing "" here would erase an
  // established client's details the first time they touched an unrelated
  // preference.
  const existing = await getCampaignDefaults(session.sub)

  const kept = {
    yearsInBusiness: clean(body.yearsInBusiness, 10),
    preferredStyle: STYLES.includes(style) ? style : "modern",
    contactName: clean(body.contactName, 120),
    socialHandles: clean(body.socialHandles, 200),
    targetAudience: clean(body.targetAudience, 200),
    serviceArea: clean(body.serviceArea, 200),
    pastOffers: cleanList(body.pastOffers),
  }

  // Lazy retirement: once this record holds nothing unique AND the canonical
  // profile exists to answer for the overlap fields, the key has no reader
  // left and is removed on this write. Never in bulk — see
  // deleteCampaignDefaults.
  const nothingUniqueLeft =
    !kept.yearsInBusiness &&
    !kept.contactName &&
    !kept.socialHandles &&
    !kept.targetAudience &&
    !kept.serviceArea &&
    kept.pastOffers.length === 0 &&
    kept.preferredStyle === "modern"

  if (nothingUniqueLeft && (await getCanonicalProfile(session.sub))) {
    await deleteCampaignDefaults(session.sub)
    return NextResponse.json({ ok: true, defaults: null, retired: true })
  }

  const saved = await saveCampaignDefaults(session.sub, {
    ...kept,
    // Preserved, not re-read from the request.
    brandColors: existing?.brandColors ?? "",
    voiceTone: existing?.voiceTone ?? "",
    website: existing?.website ?? "",
    address: existing?.address ?? "",
  })

  return NextResponse.json({ ok: true, defaults: saved })
}
