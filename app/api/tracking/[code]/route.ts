import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getTrackingRecord, getTrackingStats } from "@/lib/store"

// GET /api/tracking/[code] — scan/click stats for one flyer, for the
// dashboard's own display. A client may only read a code that's actually
// theirs (checked against the record's email); admin may read any.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSessionIdentity(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { code } = await params
  const record = await getTrackingRecord(code)
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (session.sub !== ADMIN_SUB && session.sub !== record.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stats = await getTrackingStats(code)
  return NextResponse.json({ stats })
}
