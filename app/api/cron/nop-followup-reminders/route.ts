import { NextRequest, NextResponse } from "next/server"
import { runFollowUpReminders } from "@/lib/enterprise/portal/followup-reminders"

// GET /api/cron/nop-followup-reminders — the daily follow-up reminder to agents
// (lib/enterprise/portal/followup-reminders.ts), called by Vercel cron (vercel.json).
// Only with Vercel's "Authorization: Bearer <CRON_SECRET>". Sends only where the org
// switch is on, only when something is due, once per agent per day.
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 })
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await runFollowUpReminders({ live: true, by: "daily job" }))
}
