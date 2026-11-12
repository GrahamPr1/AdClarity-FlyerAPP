import { countLeadsForFlyer, getTrackingMonthStats, getTrackingRecord, getTrackingStats, listFlyerChannelCodes } from "@/lib/store"
import { statsMonth, statsMonthStart } from "@/lib/stats-month"
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
 * "This month" is the current calendar month in Eastern time (stats-month.ts).
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

  const leads = await countLeadsForFlyer(flyerId, statsMonthStart(month))
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

/**
 * What a TRIAL account may read of its own tracking: scan counts only.
 *
 * Clicks, the per-channel breakdown and leads are what Basic sells ("QR scan
 * & click tracking"), and the dashboard already showed trial only a scan
 * count — but the endpoints returned everything, so the gate was the UI's
 * alone (Phase 0). Withheld values are ABSENT, never zeroed: a 0 would be a
 * false number. Counting itself never stops, so upgrading shows the history.
 */
export interface TrialTrackingView {
  flyerId: string
  month: string
  totalScans: number
  scansThisMonth: number
  withheld: ["clicks", "channels", "leads"]
}

export function scansOnly(b: FlyerTrackingBreakdown): TrialTrackingView {
  return { flyerId: b.flyerId, month: b.month, totalScans: b.totalScans, scansThisMonth: b.scansThisMonth, withheld: ["clicks", "channels", "leads"] }
}
