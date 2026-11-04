import { getAgentProfile, getClient } from "@/lib/store"
import { offerPageFeaturesEnabled } from "@/lib/agent-pipeline/plan-features"

/**
 * Whether this owner's offer pages take leads and can be edited, read live
 * from their records. Throws if a lookup fails, so a caller never switches the
 * features on by accident; /r/<code> catches that and still shows the offer.
 */
export async function offerPageFeaturesEnabledFor(email: string): Promise<boolean> {
  const [client, agent] = await Promise.all([getClient(email), getAgentProfile(email)])
  return offerPageFeaturesEnabled(client, !!agent?.orgId)
}
