import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { checkOrgConfig } from "@/lib/ap/validate"
import { createOrg, listOrgs } from "@/lib/ap/store"
import { jsonError, noStore, readJson } from "@/lib/ap/http"

// GET  /api/admin/organizations          every org (admins only)
// POST /api/admin/organizations          create an org (status starts at "intake")
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  return NextResponse.json({ orgs: await listOrgs() }, { headers: noStore })
}

export async function POST(request: NextRequest) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const input = checkOrgConfig(await readJson(request))
  if (!input.ok) return jsonError(422, "invalid", { field: input.field, message: input.error })
  const out = await createOrg(input.value, a.admin)
  if (!out.ok) return jsonError(409, out.error, { field: "slug", message: "That slug is taken." })
  return NextResponse.json({ org: out.org }, { status: 201, headers: noStore })
}
