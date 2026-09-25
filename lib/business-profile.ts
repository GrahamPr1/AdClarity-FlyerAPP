import type { BrandColorRoles } from "@/lib/types"
import type { PageReport } from "@/lib/agent-pipeline/page-report"

/**
 * THE canonical business profile.
 *
 * ARCHITECTURE NOTE — why this is a new key rather than an extension of an
 * existing one. Five places already held business facts before this:
 *
 *   client:<email>:campaignDefaults   the client's own typed answers
 *   client:<email>:brand-profile      the Brand Agent's inferred output
 *   client:<email>:business-profile   a file/link for form-fill (misnamed;
 *                                     it is NOT a business profile)
 *   client:<email>:businessName/...   flat fields on the ClientRecord
 *   client:<email>:agent-profile      the full NormalizedIntake of a run
 *
 * Consolidating them by rewriting live records would be a one-way migration
 * across every production account, on a store with no schema tooling and no
 * rollback. So instead: ONE canonical record is written here, and reads fall
 * back to the legacy stores when it is absent, which means existing clients
 * keep everything they already had without their data being touched. The
 * legacy keys stop receiving new business-profile writes and become
 * read-only sources feeding this one.
 *
 * Deliberately NOT a sixth competing store: nothing else may write business
 * facts after this, and resolveBusinessProfile is the only supported read.
 */
export interface BusinessProfile {
  /** ISO timestamp of the last write. */
  savedAt: string
  /** Where the facts came from, so the UI can be honest about it. */
  source: "website_scan" | "manual" | "legacy_backfill"

  businessName: string | null
  /** Canonical https URL, as produced by normalizeWebsiteUrl. */
  website: string | null
  description: string | null
  industry: string | null
  services: string[]

  contact: {
    phone: string | null
    email: string | null
    address: string | null
    social: { platform: string; handle: string }[]
  }

  brand: {
    logoUrl: string | null
    colors: BrandColorRoles | null
    tone: string | null
  }

  /** Free-text marketing language observed on the site. Never invented. */
  terminology: string[]
  /** Calls to action found on the site, e.g. "Book a free estimate". */
  ctas: string[]

  /** Which pages the scan actually read, for the Control Center and for trust. */
  scannedPages?: string[]
  /**
   * The same pages with their title, size and which extracted facts appear on
   * them. Optional so profiles saved before this existed stay valid without
   * migration; scannedPages is kept alongside it for the same reason.
   */
  pageReports?: PageReport[]
}

export function emptyBusinessProfile(): BusinessProfile {
  return {
    savedAt: new Date().toISOString(),
    source: "manual",
    businessName: null,
    website: null,
    description: null,
    industry: null,
    services: [],
    contact: { phone: null, email: null, address: null, social: [] },
    brand: { logoUrl: null, colors: null, tone: null },
    terminology: [],
    ctas: [],
  }
}

/** True when the profile carries enough to skip re-asking the basics. */
export function isProfileUsable(p: BusinessProfile | null): boolean {
  if (!p) return false
  return Boolean(p.businessName && (p.services.length > 0 || p.description))
}

/**
 * How complete the profile is, 0-1, for the dashboard's "what's missing"
 * prompt. Weighted by what actually improves a flyer rather than by field
 * count — a logo and a phone number matter more than terminology.
 */
export function profileCompleteness(p: BusinessProfile): { score: number; missing: string[] } {
  const checks: { label: string; weight: number; present: boolean }[] = [
    { label: "Business name", weight: 2, present: !!p.businessName },
    { label: "Website", weight: 1, present: !!p.website },
    { label: "Description", weight: 2, present: !!p.description },
    { label: "Services", weight: 2, present: p.services.length > 0 },
    { label: "Phone number", weight: 2, present: !!p.contact.phone },
    { label: "Logo", weight: 2, present: !!p.brand.logoUrl },
    { label: "Brand colors", weight: 1, present: !!p.brand.colors },
    { label: "Address", weight: 1, present: !!p.contact.address },
  ]
  const total = checks.reduce((sum, c) => sum + c.weight, 0)
  const got = checks.reduce((sum, c) => sum + (c.present ? c.weight : 0), 0)
  return {
    score: total === 0 ? 0 : got / total,
    missing: checks.filter((c) => !c.present).map((c) => c.label),
  }
}
