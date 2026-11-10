import { NextRequest, NextResponse } from "next/server"
import { runMonthlyEmail } from "@/lib/enterprise/portal/monthly-email"

// GET /api/cron/nop-monthly-email — the monthly results email to Pro/Leader agents
// (lib/enterprise/portal/monthly-email.ts), called by Vercel cron on the 1st (vercel.json).
// Only with Vercel's "Authorization: Bearer <CRON_SECRET>". Sends only to agents whose
// org has the monthly email switched on; once per agent per month.
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 })
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await runMonthlyEmail({ live: true, by: "monthly job" }))
}
