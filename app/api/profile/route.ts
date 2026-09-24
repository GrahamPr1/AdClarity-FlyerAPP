import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { resolveBusinessProfile, persistBusinessProfile } from "@/lib/business-profile-resolve"
import { profileCompleteness, type BusinessProfile } from "@/lib/business-profile"
import { normalizeWebsiteUrl } from "@/lib/url-normalize"
import { setClientBusinessName } from "@/lib/store"

/**
 * The canonical Business Profile.
 *
 * NOT /api/business-profile — that route is years old and serves the
 * form-fill file/link record, which despite the name is not a business
 * profile. Renaming it would break saved records, so the new canonical
 * resource takes the shorter path and the old one keeps its own.
 *
 * GET falls back to the legacy stores for clients who predate the scanner
 * (see resolveBusinessProfile), so an established account never looks empty.
 */
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // The admin session is the site owner, not a client with a business.
  if (session.sub === ADMIN_SUB) {
    return NextResponse.json({ profile: null, completeness: null }, { headers: { "Cache-Control": "no-store" } })
  }

  const profile = await resolveBusinessProfile(session.sub)
  return NextResponse.json(
    { profile, completeness: profile ? profileCompleteness(profile) : null },
    { headers: { "Cache-Control": "no-store" } },
  )
}

/** Field-level edit. Only the fields sent are changed, so the dashboard can
 *  patch one value without having to round-trip the whole record. */
export async function PUT(req: NextRequest) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Not available for the admin account" }, { status: 403 })
  }

  let body: Partial<BusinessProfile>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const existing = (await resolveBusinessProfile(session.sub)) ?? {
    ...(await import("@/lib/business-profile")).emptyBusinessProfile(),
  }

  const str = (v: unknown, max = 500): string | null => {
    if (typeof v !== "string") return null
    const t = v.trim()
    return t ? t.slice(0, max) : null
  }
  const strArray = (v: unknown, max = 40): string[] | null => {
    if (!Array.isArray(v)) return null
    return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, max)
  }

  const next: BusinessProfile = {
    ...existing,
    // A hand edit is the client's own answer, so it outranks the scan from
    // here on — the same precedence lib/brand-controls.ts documents.
    source: "manual",
    businessName: "businessName" in body ? str(body.businessName) : existing.businessName,
    description: "description" in body ? str(body.description, 2000) : existing.description,
    industry: "industry" in body ? str(body.industry, 120) : existing.industry,
    services: "services" in body ? (strArray(body.services) ?? existing.services) : existing.services,
    contact: {
      ...existing.contact,
      ...("contact" in body && body.contact
        ? {
            phone: "phone" in body.contact ? str(body.contact.phone, 40) : existing.contact.phone,
            email: "email" in body.contact ? str(body.contact.email, 200) : existing.contact.email,
            address: "address" in body.contact ? str(body.contact.address, 300) : existing.contact.address,
          }
        : {}),
    },
    brand: {
      ...existing.brand,
      ...("brand" in body && body.brand
        ? {
            logoUrl: "logoUrl" in body.brand ? str(body.brand.logoUrl, 2000) : existing.brand.logoUrl,
            tone: "tone" in body.brand ? str(body.brand.tone, 200) : existing.brand.tone,
            colors: "colors" in body.brand ? (body.brand.colors ?? null) : existing.brand.colors,
          }
        : {}),
    },
  }

  if ("website" in body) {
    const raw = str(body.website, 2000)
    if (raw) {
      const normalized = normalizeWebsiteUrl(raw)
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.message }, { status: 400 })
      }
      next.website = normalized.url
    } else {
      next.website = null
    }
  }

  await persistBusinessProfile(session.sub, next)
  // Keep the flat ClientRecord name in step, same as the scanner does.
  if (next.businessName) await setClientBusinessName(session.sub, next.businessName)

  return NextResponse.json(
    { profile: next, completeness: profileCompleteness(next) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
