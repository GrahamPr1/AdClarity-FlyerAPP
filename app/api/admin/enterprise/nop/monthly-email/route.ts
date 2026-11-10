import { NextRequest, NextResponse } from "next/server"
import { requireNopAdmin } from "@/lib/enterprise/program-admins"
import { listMonthlyRuns, runMonthlyEmail } from "@/lib/enterprise/portal/monthly-email"

// /api/admin/enterprise/nop/monthly-email — the owner or a program admin.
//   GET    the last runs
//   POST   a dry run now: who would get last month's email; nothing is sent. Admins never send it.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ runs: await listMonthlyRuns() }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const run = await runMonthlyEmail({ live: false, by: auth.admin })
  return NextResponse.json({ run, runs: await listMonthlyRuns() })
}
