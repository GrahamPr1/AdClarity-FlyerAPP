import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { sendOperationalAlert } from "@/lib/email"
import { alertRecipient, runHealthCheck, type Simulate } from "@/lib/health/run"

// GET /api/cron/health — the daily health check (vercel.json crons).
//
// Vercel sends "Authorization: Bearer $CRON_SECRET". With the secret, two
// test switches exist for proving the alerts work: ?simulate=nop|business
// makes that check request something that really fails, and ?weekly=1
// sends the weekly summary on a passing run.

export const maxDuration = 120
export const dynamic = "force-dynamic"

function authorized(request: NextRequest, secret: string): boolean {
  const got = Buffer.from(request.headers.get("authorization") ?? "")
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    // Without the secret the cron can never pass auth, so say so loudly
    // rather than failing silently every day.
    if (/vercel-cron/i.test(request.headers.get("user-agent") ?? "")) {
      await sendOperationalAlert("OneFlyer health check can't run: CRON_SECRET is not set", [
        "The daily health check was called by Vercel cron but CRON_SECRET is not configured for this environment, so no checks ran.",
      ], alertRecipient())
    }
    console.error("[health] CRON_SECRET is not configured")
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }
  if (!authorized(request, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const sim = url.searchParams.get("simulate")
  const simulate: Simulate = sim === "nop" || sim === "business" ? sim : null
  const run = await runHealthCheck({ simulate, forceWeekly: url.searchParams.get("weekly") === "1" })
  return NextResponse.json(run, { status: run.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } })
}
