import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { getApproved, getContent, getOrg, saveApproved } from "@/lib/ap/store"
import { templatesFor } from "@/lib/ap/templates/content"
import { approvalRendersFor, sourceFromOrg } from "@/lib/ap/flyers"
import { renderErrorResponse } from "@/lib/ap/flyer-http"
import { jsonError, noStore, readJson } from "@/lib/ap/http"

// GET  /api/admin/organizations/{id}/approve   the approved version (or null)
// POST /api/admin/organizations/{id}/approve   {note?} "proofs approved": renders every
//      offered template at Letter and bleed from the current draft, and pins each page's
//      hash and spacing with an exact snapshot of the content. From then on agents get
//      only this version, hash-checked on every render.
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  return NextResponse.json({ approved: await getApproved(org.id) }, { headers: noStore })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  const content = await getContent(org.id)
  if (!content || templatesFor(content.packages, org.languages).length === 0) return jsonError(422, "no_content", { message: "Save at least one package first." })
  const note = String((await readJson(request))?.note ?? "").trim().slice(0, 200)
  const approvedAt = new Date().toISOString()
  try {
    const templates = await approvalRendersFor(org, { ...sourceFromOrg(org, content.packages), approvedAt })
    const approved = await saveApproved(org.id, {
      approvedAt,
      approvedBy: a.admin,
      note,
      orgName: org.name,
      orgCode: org.orgCode,
      footer: org.footer,
      languages: org.languages,
      logo: org.logo,
      packages: content.packages,
      templates,
    })
    return NextResponse.json({ approved }, { headers: noStore })
  } catch (err) {
    return renderErrorResponse(err)
  }
}
