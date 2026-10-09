import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { listHealthRuns } from "@/lib/health/run"

// GET /api/admin/health -> the recent daily health-check runs, newest first. Site owner only.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const runs = await listHealthRuns(14)
  const hoursSinceLast = runs[0] ? Math.round((Date.now() - Date.parse(runs[0].at)) / 3600_000) : null
  return NextResponse.json({ runs, hoursSinceLast }, { headers: { "Cache-Control": "no-store" } })
}
