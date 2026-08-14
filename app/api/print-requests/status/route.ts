import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { updatePrintRequestStatus } from "@/lib/store"

const VALID_STATUSES = new Set(["Requested", "Fulfilled", "Cancelled"])

// POST /api/print-requests/status — admin-only. This is how the admin marks
// a print request as fulfilled (after actually printing/shipping/invoicing
// it themselves, outside this app) or cancels it.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub !== ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { email?: string; requestId?: string; status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const requestId = body.requestId?.trim()
  const status = body.status

  if (!email) return NextResponse.json({ error: "Missing required field: email" }, { status: 422 })
  if (!requestId) return NextResponse.json({ error: "Missing required field: requestId" }, { status: 422 })
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be one of: Requested, Fulfilled, Cancelled" }, { status: 422 })
  }

  const updated = await updatePrintRequestStatus(email, requestId, status as "Requested" | "Fulfilled" | "Cancelled")
  if (!updated) {
    return NextResponse.json({ error: "Print request not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
