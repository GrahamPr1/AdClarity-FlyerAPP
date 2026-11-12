import { NextRequest, NextResponse } from "next/server"
import { runLeadDigest } from "@/lib/lead-digest"
import { digestLive, monthlyLive } from "@/lib/email-preferences"
import { runMonthlyResults } from "@/lib/monthly-results"

// GET /api/cron/public-emails — the PUBLIC product's scheduled emails, one
// daily job (vercel.json, 13:00 UTC): the lead digest (lib/lead-digest.ts)
// and, in the first days of a month, the monthly results email
// (lib/monthly-results.ts). Only with Vercel's "Authorization: Bearer
// <CRON_SECRET>", as the NOP crons.
//
// Each email has its own switch, so one can go live before another: the
// digest sends only with PUBLIC_DIGEST_LIVE=1, the monthly email only with
// PUBLIC_MONTHLY_EMAIL_LIVE=1. Off, it reports what it WOULD
// send and keeps every queue intact, so switching it on loses nothing — and
// nothing reaches a customer before the owner has read the samples
// (scripts/send-email-samples.ts).
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 })
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const live = digestLive()
  const digest = await runLeadDigest({ live })
  console.log(
    `[public-emails] lead digest (${live ? "LIVE" : "dry run"}): ${digest.accounts} account(s); ` +
      `${digest.sent.length} sent, ${digest.wouldSend.length} would send, ${digest.dropped.length} dropped, ${digest.failed.length} failed`,
  )
  const monthlyIsLive = monthlyLive()
  const monthly = await runMonthlyResults({ live: monthlyIsLive })
  if (monthly.inWindow) {
    console.log(
      `[public-emails] monthly results for ${monthly.month} (${monthlyIsLive ? "LIVE" : "dry run"}): ${monthly.accounts} account(s); ` +
        `${monthly.sent.length} sent, ${monthly.wouldSend.length} would send, ${monthly.skipped.length} skipped, ${monthly.failed.length} failed`,
    )
  }
  return NextResponse.json({ live, digest, monthly })
}
