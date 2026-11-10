import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { listRetentionRuns, retentionLive, runRetentionJob } from "@/lib/enterprise/portal/retention-job"

// GET  /api/admin/enterprise/nop/retention -> whether the daily job deletes (live) or only reports (dry run), and its recent runs
// POST /api/admin/enterprise/nop/retention -> a DRY RUN now (never deletes, whatever the setting), logged under the admin
// OneFlyer admin only.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ live: retentionLive(), runs: await listRetentionRuns() }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const run = await runRetentionJob({ live: false, by: auth.admin })
  await audit(auth, "retention_dry_run", `${run.agents.length} agent(s) due, ${run.totalLeads} lead(s)`)
  return NextResponse.json({ run, live: retentionLive(), runs: await listRetentionRuns() })
}
