import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { loadBillingData } from "@/lib/billing-admin-data"
import { membersCsv, toMemberRow } from "@/lib/billing-admin"

// GET /api/admin/billing/members[?format=csv]
// Every account with its billing state. Sorting and filtering happen
// client-side, like /api/admin/users. The CSV is the same rows, nothing more.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { clients, waitlistEmails } = await loadBillingData()
  const rows = clients.map((c) => toMemberRow(c, waitlistEmails))

  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(membersCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="oneflyer-members.csv"',
        "Cache-Control": "no-store",
      },
    })
  }
  return NextResponse.json({ members: rows })
}
