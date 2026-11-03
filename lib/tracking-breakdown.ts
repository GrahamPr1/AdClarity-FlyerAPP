import { countLeadsForFlyer, getTrackingMonthStats, getTrackingRecord, getTrackingStats, listFlyerChannelCodes, statsMonth } from "@/lib/store"
import { UNLABELED_CHANNEL, type ChannelStats, type FlyerTrackingBreakdown } from "@/lib/types"

/**
 * Per-channel scan/click breakdown for one flyer.
 *
 * The flyer's ORIGINAL code is passed in from the deliverable rather than
 * looked up in the channel index, and that is the whole reason no migration
 * is needed: every flyer generated before channels existed still reports a
 * breakdown, with all of its scans under UNLABELED_CHANNEL.
 *
 * Contains no personal data by construction — it reads integer counters and
 * a label per code, and only a COUNT of leads. There is nothing about who
 * scanned to leave out.
 *
 * "This month" is the current UTC calendar month.
 */
export async function buildFlyerBreakdown(
  flyerId: string,
  originalCode: string | undefined,
  /** Only records belonging to this email are counted. */
  ownerEmail: string,
): Promise<FlyerTrackingBreakdown> {
  const channelCodes = await listFlyerChannelCodes(flyerId)
  const codes = [...(originalCode ? [originalCode] : []), ...channelCodes.filter((c) => c !== originalCode)]

  const month = statsMonth()
  const channels: ChannelStats[] = []
  let scansThisMonth = 0
  let clicksThisMonth = 0
  for (const code of codes) {
    const record = await getTrackingRecord(code)
    // A code whose record is gone, or belongs to someone else, is skipped
    // rather than counted — the reverse index is not an ownership claim.
    if (!record || record.email !== ownerEmail || record.flyerId !== flyerId) continue
    const [stats, monthly] = await Promise.all([getTrackingStats(code), getTrackingMonthStats(code, month)])
    scansThisMonth += monthly.scans
    clicksThisMonth += monthly.clicks
    channels.push({
      code,
      label: record.channelLabel ?? UNLABELED_CHANNEL,
      scans: stats.scans,
      clicks: stats.clicks,
      isChannel: Boolean(record.channelLabel),
    })
  }

  // Unlabeled first, then busiest — a reader wants the baseline, then which
  // channel actually worked.
  channels.sort((a, b) => Number(a.isChannel) - Number(b.isChannel) || b.scans - a.scans)

  const leads = await countLeadsForFlyer(flyerId, new Date(`${month}-01T00:00:00.000Z`))
  return {
    flyerId,
    totalScans: channels.reduce((sum, c) => sum + c.scans, 0),
    totalClicks: channels.reduce((sum, c) => sum + c.clicks, 0),
    channels,
    month,
    scansThisMonth,
    clicksThisMonth,
    totalLeads: leads.total,
    leadsThisMonth: leads.since,
  }
}
