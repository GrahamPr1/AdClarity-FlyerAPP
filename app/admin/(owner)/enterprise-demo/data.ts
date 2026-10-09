import { getDeliverablesForEmail, listContentAssets, getAgentProfile, campaignSources } from "@/lib/store"
import { toAssetContext } from "@/lib/agent-pipeline/enterprise"
import { attributeBlocks, summariseAttribution, type AttributedBlock, type AttributionSummary } from "@/lib/agent-pipeline/attribution"
import type { CampaignSource } from "@/lib/types"

/**
 * Shared by the demo page's server render and its polling endpoint, so the
 * first paint and every refresh are computed the same way. Two copies of this
 * would eventually disagree, and the disagreement would look like a bug in
 * attribution rather than in the demo.
 *
 * Callers are responsible for the admin check — this does no auth of its own.
 */

export const DEMO_AGENT_EMAIL = "dana@northstar.invalid"

export interface EnterpriseDemoData {
  flyer: {
    id: string
    status: string
    title: string
    html: string | null
    sources: CampaignSource[]
  } | null
  blocks: AttributedBlock[]
  summary: AttributionSummary
  library: { assetId: string; label: string; locked: boolean; content: string }[]
  orgId: string | null
}

/** The pipeline stores the rendered flyer as a base64 data URL. */
function htmlFromDownloadUrl(downloadUrl: string | undefined): string | null {
  if (!downloadUrl) return null
  const prefix = "data:text/html;charset=utf-8;base64,"
  if (!downloadUrl.startsWith(prefix)) return null
  try {
    return Buffer.from(downloadUrl.slice(prefix.length), "base64").toString("utf8")
  } catch {
    return null
  }
}

export async function loadEnterpriseDemoData(email: string): Promise<EnterpriseDemoData> {
  const profile = await getAgentProfile(email)
  const library = profile?.orgId ? toAssetContext(await listContentAssets(profile.orgId)) : []

  // seedFlyerDeliverables appends, so the newest flyer is the last one. There
  // is no timestamp on FlyerDeliverable to sort by.
  const deliverables = await getDeliverablesForEmail(email)
  const flyers = deliverables.flyers ?? []
  const flyer = flyers.length > 0 ? flyers[flyers.length - 1] : null

  const html = htmlFromDownloadUrl(flyer?.downloadUrl)
  const blocks = html ? attributeBlocks(html, library) : []

  return {
    flyer: flyer
      ? {
          id: flyer.id,
          status: flyer.status,
          title: flyer.title ?? "",
          html,
          sources: campaignSources(flyer),
        }
      : null,
    blocks,
    summary: summariseAttribution(blocks),
    library,
    orgId: profile?.orgId ?? null,
  }
}
