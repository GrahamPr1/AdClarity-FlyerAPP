import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { isOrgStatus } from "@/lib/ap/validate"
import { setOrgStatus } from "@/lib/ap/store"
import { jsonError, noStore, readJson } from "@/lib/ap/http"

// POST /api/admin/organizations/{id}/status  {status}
// intake / building / proof-sent / live / paused. "live" will require an
// approved flyer snapshot once flyer slots exist (pending slot approval).
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const status = (await readJson(request))?.status
  if (!isOrgStatus(status)) return jsonError(422, "invalid", { field: "status" })
  const org = await setOrgStatus((await params).id, status, a.admin)
  if (!org) return jsonError(404, "not_found")
  return NextResponse.json({ org }, { headers: noStore })
}
