import {
  getCanonicalProfile,
  saveCanonicalProfile,
  getCampaignDefaults,
  getSavedBrandProfile,
  getClient,
  getPipelineState,
} from "@/lib/store"
import { emptyBusinessProfile, type BusinessProfile } from "@/lib/business-profile"
import { normalizeWebsiteUrl } from "@/lib/url-normalize"
import type { BrandColorRoles } from "@/lib/types"

/**
 * The ONLY supported read of a client's business facts.
 *
 * Returns the canonical record when one exists. When it doesn't — every
 * client who existed before the scanner shipped — it assembles one from the
 * legacy stores instead of returning null, so an established account does not
 * suddenly look brand new. Nothing is written back during a read: the
 * backfill is computed each time until the client next saves a real profile,
 * which keeps the legacy records authoritative for their own data and means
 * this is reversible by deleting one key.
 *
 * Precedence, highest first:
 *   1. canonical :profile          (written by the scanner or by an edit)
 *   2. campaignDefaults            (the client's OWN typed answers)
 *   3. agent-profile / NormalizedIntake  (last run's normalised intake)
 *   4. brand-profile               (Brand Agent OUTPUT — inferred, so last)
 *   5. ClientRecord                (businessName only)
 *
 * The client's own typed answers deliberately outrank the AI's inference,
 * which is the same precedence lib/brand-controls.ts already documents for
 * colours: a human correction must never be silently overwritten by a model.
 */
export async function resolveBusinessProfile(email: string): Promise<BusinessProfile | null> {
  const canonical = await getCanonicalProfile(email)
  if (canonical) return canonical

  const [defaults, brand, client, pipeline] = await Promise.all([
    getCampaignDefaults(email).catch(() => null),
    getSavedBrandProfile(email).catch(() => null),
    getClient(email).catch(() => null),
    getPipelineState(email).catch(() => null),
  ])

  // Nothing at all on record: a genuinely new account. null, not an empty
  // profile — the caller needs to tell "new" from "known but sparse".
  if (!defaults && !brand && !pipeline && !client?.businessName) return null

  const intake = pipeline?.intake ?? null
  const p = emptyBusinessProfile()
  p.source = "legacy_backfill"
  p.savedAt = defaults?.savedAt ?? brand?.savedAt ?? new Date().toISOString()

  p.businessName =
    client?.businessName ?? intake?.businessName ?? brand?.brandProfile.businessName ?? null

  const rawWebsite = defaults?.website || intake?.contact.website || brand?.contact.website || ""
  if (rawWebsite) {
    const normalized = normalizeWebsiteUrl(rawWebsite)
    p.website = normalized.ok ? normalized.url : rawWebsite
  }

  p.industry = intake?.industry ?? null
  p.description = brand?.brandProfile.positioning ?? null
  p.services = intake?.services ?? []

  p.contact.phone = intake?.contact.phone ?? brand?.contact.phone ?? null
  p.contact.address = defaults?.address || intake?.contact.address || brand?.contact.address || null
  p.contact.social = intake?.contact.social ?? brand?.contact.social ?? []

  p.brand.logoUrl = intake?.brandAssets.logoUrl ?? null
  p.brand.tone = defaults?.voiceTone || intake?.voiceTonePreference || null
  p.brand.colors = rolesFromLegacyColors(
    brand?.brandProfile.colors?.map((c) => c.hex) ?? intake?.brandAssets.existingColors ?? null,
    defaults?.brandColors ?? null,
  )

  return p
}

/**
 * Legacy colours are a flat list with no roles. Rather than invent roles the
 * evidence doesn't support, this only fills primary/secondary/accent in the
 * order the colours were recorded — which IS the order the Brand Agent
 * emitted them (most to least prominent) — and leaves background and text
 * null. A flyer generator can then tell "we don't know" from "it's white".
 */
function rolesFromLegacyColors(hexes: string[] | null, typed: string | null): BrandColorRoles | null {
  const fromTyped = (typed ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s))

  const ordered = [...fromTyped, ...(hexes ?? []).map((h) => h.trim().toLowerCase())]
  const unique = Array.from(new Set(ordered.filter((h) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(h))))
  if (unique.length === 0) return null

  return {
    primary: unique[0] ?? null,
    secondary: unique[1] ?? null,
    accent: unique[2] ?? null,
    background: null,
    text: null,
  }
}

/** Write the canonical record. The single supported write path. */
export async function persistBusinessProfile(email: string, profile: BusinessProfile): Promise<void> {
  await saveCanonicalProfile(email, { ...profile, savedAt: new Date().toISOString() })
}
