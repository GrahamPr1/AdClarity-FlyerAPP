import { NextRequest, NextResponse } from "next/server"
import { retentionLive, runRetentionJob } from "@/lib/enterprise/portal/retention-job"

// GET /api/cron/nop-lead-retention — the daily 12-month lead deletion job
// (lib/enterprise/portal/retention-job.ts), called by Vercel cron (vercel.json).
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
// Dry run (deletes nothing, logs what it would) unless NOP_RETENTION_LIVE=on.
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[nop-retention] CRON_SECRET is not set; not running")
    return NextResponse.json({ error: "not_configured" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const run = await runRetentionJob({ live: retentionLive(), by: "daily job" })
  return NextResponse.json({ mode: run.mode, agents: run.agents.length, leadsFound: run.totalLeads, deleted: run.totalDeleted })
}
