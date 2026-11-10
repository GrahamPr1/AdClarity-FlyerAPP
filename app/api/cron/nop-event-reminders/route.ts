import { NextRequest, NextResponse } from "next/server"
import { runEventReminders } from "@/lib/enterprise/portal/event-reminders"

// GET /api/cron/nop-event-reminders — the daily day-before event reminder
// (lib/enterprise/portal/event-reminders.ts), called by Vercel cron
// (vercel.json). Only with Vercel's "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 })
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await runEventReminders())
}
