import { getAgentProfile } from "@/lib/store"
import { isNopAgentAccount } from "@/lib/enterprise/agents-store"

/**
 * Whether this account gets the PUBLIC product's emails (lead emails, the
 * daily digest, the monthly results) and so has settings for them. Enterprise
 * org accounts and NOP agents never do: every sender already excludes them,
 * and /profile and /api/account/email-preferences use this so they aren't
 * shown or allowed to change settings for emails they can't receive.
 *
 * Fails closed: if either lookup fails, the account is treated as excluded.
 */
export async function receivesPublicEmails(email: string): Promise<boolean> {
  try {
    const [agent, nop] = await Promise.all([getAgentProfile(email), isNopAgentAccount(email)])
    return !agent?.orgId && !nop
  } catch {
    return false
  }
}
