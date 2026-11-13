import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { getContent, getOrg, saveContent } from "@/lib/ap/store"
import { checkPackages } from "@/lib/ap/templates/content"
import { checkFit } from "@/lib/ap/flyers"
import { jsonError, noStore, readJson } from "@/lib/ap/http"

// GET /api/admin/organizations/{id}/packages   the draft packages
// PUT /api/admin/organizations/{id}/packages   {packages}: budgets, then a real render of
//     each package in each enabled language; saved only if every slot and page fits.
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  return NextResponse.json({ content: await getContent(org.id) }, { headers: noStore })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  const checked = checkPackages((await readJson(request))?.packages, org.languages)
  if (!checked.ok) return jsonError(422, "invalid", { errors: checked.errors })
  const problems = await checkFit(org, checked.value)
  if (problems.length) return jsonError(422, "does_not_fit", { problems })
  const content = await saveContent(org.id, checked.value, a.admin)
  return NextResponse.json({ content }, { headers: noStore })
}
