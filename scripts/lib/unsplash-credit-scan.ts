/**
 * Shared by scripts/count-uncredited-unsplash.ts (read-only) and
 * scripts/backfill-unsplash-credits.ts: which stored documents show an
 * Unsplash photo without the credit block, and how to find who took it.
 */

export interface StoredFlyer {
  id: string
  downloadUrl?: string
  generationMode?: "ai" | "template"
  repurposed?: { instagramDownloadUrl?: string } & Record<string, unknown>
}

export interface StoredCampaign {
  id: string
  createdAt: string
  flyerIds: string[]
  formatId?: string
}

/** The credit block injectPhotoAttribution adds (lib/agent-pipeline/flyer-html.ts). */
export const CREDIT_CLASS = "oneflyer-photo-credit"

/** Unsplash image URLs used in the document, &amp; decoded back to the real URL. */
export function unsplashPhotoUrls(html: string): string[] {
  const urls = new Set<string>()
  for (const m of html.matchAll(/(?:src\s*=\s*["']|url\(\s*["']?)(https:\/\/images\.unsplash\.com\/[^"')\s]+)/gi)) {
    urls.add(m[1].replace(/&amp;/g, "&"))
  }
  return [...urls]
}

export interface DocumentFinding {
  document: "downloadUrl" | "instagram"
  hasUnsplash: boolean
  uncredited: boolean
  photoUrls: string[]
  createdAt: string | null
  formatId: string | undefined
  mode: string
}

export function findUncreditedUnsplash(
  flyer: StoredFlyer,
  campaigns: StoredCampaign[],
  decode: (dataUrl: string) => string | null,
): DocumentFinding[] {
  const campaign = campaigns.find((c) => c.flyerIds?.includes(flyer.id))
  const out: DocumentFinding[] = []
  for (const [document, dataUrl] of [
    ["downloadUrl", flyer.downloadUrl],
    ["instagram", flyer.repurposed?.instagramDownloadUrl],
  ] as const) {
    if (!dataUrl?.startsWith("data:text/html")) continue
    const html = decode(dataUrl)
    if (!html) continue
    const photoUrls = unsplashPhotoUrls(html)
    out.push({
      document,
      hasUnsplash: photoUrls.length > 0,
      uncredited: photoUrls.length > 0 && !html.includes(CREDIT_CLASS),
      photoUrls,
      createdAt: campaign?.createdAt ?? null,
      formatId: campaign?.formatId,
      mode: flyer.generationMode ?? "ai (pre-template)",
    })
  }
  return out
}

/**
 * The search an Unsplash URL came from. Unsplash's `ixid` parameter is
 * base64 of "…|search|<position>||<query>|<lang>|…" for photos found through
 * the search API — which is how every OneFlyer stock photo was found.
 */
export function searchFromIxid(photoUrl: string): { query: string; position: number } | null {
  try {
    const ixid = new URL(photoUrl).searchParams.get("ixid")
    if (!ixid) return null
    const parts = Buffer.from(ixid, "base64").toString("utf8").split("|")
    const i = parts.indexOf("search")
    if (i < 0) return null
    const query = decodeURIComponent(parts[i + 3] ?? "")
    return query ? { query, position: Number(parts[i + 1]) || 0 } : null
  } catch {
    return null
  }
}

/** The stable part of an Unsplash image URL ("photo-1528698827591-e19ccd7bc23d"), for matching. */
export function photoSlug(photoUrl: string): string | null {
  try {
    return new URL(photoUrl).pathname.replace(/^\/+/, "") || null
  } catch {
    return null
  }
}
