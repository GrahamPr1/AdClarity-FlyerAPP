import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { isOrgStatus } from "@/lib/ap/validate"
import { getApproved, setOrgStatus } from "@/lib/ap/store"
import { jsonError, noStore, readJson } from "@/lib/ap/http"

// POST /api/admin/organizations/{id}/status  {status}
// intake / building / proof-sent / live / paused. "live" requires an approved version.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const status = (await readJson(request))?.status
  if (!isOrgStatus(status)) return jsonError(422, "invalid", { field: "status" })
  const id = (await params).id
  if (status === "live" && !(await getApproved(id))) return jsonError(422, "not_approved", { message: "Approve the proofs before going live." })
  const org = await setOrgStatus(id, status, a.admin)
  if (!org) return jsonError(404, "not_found")
  return NextResponse.json({ org }, { headers: noStore })
}
