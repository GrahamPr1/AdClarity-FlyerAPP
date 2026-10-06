import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { validateRosterCsv } from "@/lib/enterprise/nop-roster"
import { importRoster, listRoster } from "@/lib/enterprise/agents-store"

// GET  /api/admin/enterprise/nop/roster  -> every roster record + who it is locked to
// POST /api/admin/enterprise/nop/roster  { csv } -> per-row import report
//
// Same isAdminSession gate as every other /api/admin/* route.

async function requireAdmin(request: NextRequest) {
  const session = await getSessionIdentity(request)
  return isAdminSession(session?.sub)
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ roster: await listRoster() }, { headers: { "Cache-Control": "no-store" } })
}

// A roster is a few thousand rows at most; this keeps a stray upload of
// something else from being parsed in full.
const MAX_CSV_BYTES = 2 * 1024 * 1024

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let csv: unknown
  try {
    csv = ((await request.json()) as { csv?: unknown }).csv
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (typeof csv !== "string" || csv.trim() === "") {
    return NextResponse.json({ error: "Paste or choose a CSV file first." }, { status: 422 })
  }
  if (csv.length > MAX_CSV_BYTES) return NextResponse.json({ error: "That file is too large for a roster." }, { status: 413 })

  const parsed = validateRosterCsv(csv)
  if (parsed.fileErrors.length > 0) {
    return NextResponse.json({ error: "file_invalid", fileErrors: parsed.fileErrors }, { status: 422 })
  }
  const { created, updated } = await importRoster(parsed.accepted)
  return NextResponse.json({
    created,
    updated,
    rejected: parsed.rejected,
    flagged: parsed.flagged,
  })
}
