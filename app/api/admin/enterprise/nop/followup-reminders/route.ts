import { NextRequest, NextResponse } from "next/server"
import { requireNopAdmin } from "@/lib/enterprise/program-admins"
import { listFollowUpRuns, runFollowUpReminders } from "@/lib/enterprise/portal/followup-reminders"

// /api/admin/enterprise/nop/followup-reminders — the owner or a program admin.
//   GET    the last runs
//   POST   a dry run now: how many agents would get today's reminder; nothing is sent.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ runs: await listFollowUpRuns() }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const run = await runFollowUpReminders({ live: false, by: auth.admin })
  return NextResponse.json({ run, runs: await listFollowUpRuns() })
}
