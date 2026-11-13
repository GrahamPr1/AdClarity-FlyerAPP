import type { NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { getApproved, getContent, getOrg } from "@/lib/ap/store"
import { parseTemplateId, templatesFor } from "@/lib/ap/templates/content"
import { SAMPLE_AGENT, SAMPLE_QR_CODE, agentValuesFor, inputFor, sourceFromApproved, sourceFromOrg } from "@/lib/ap/flyers"
import { renderFlyer } from "@/lib/ap/templates/render"
import { fileResponse, parseOutput, parseSize, renderErrorResponse } from "@/lib/ap/flyer-http"
import { jsonError } from "@/lib/ap/http"

// GET /api/admin/organizations/{id}/preview?template=&size=letter|bleed&format=png|pdf|thumb&source=draft|approved
// The org's flyer with the sample agent. source=draft (default) is always a
// PROOF; source=approved renders the approved version through the same hash check agents get.
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  const sp = request.nextUrl.searchParams
  const tid = parseTemplateId(sp.get("template") ?? "")
  const size = parseSize(sp.get("size"))
  const output = parseOutput(sp.get("format"))
  if (!tid || !size || !output) return jsonError(422, "invalid")

  const approvedSource = sp.get("source") === "approved"
  const approved = approvedSource ? await getApproved(org.id) : null
  if (approvedSource && !approved) return jsonError(404, "not_approved")
  const src = approved ? sourceFromApproved(approved, org) : sourceFromOrg(org, (await getContent(org.id))?.packages ?? [])
  const t = templatesFor(src.packages, src.languages).find((x) => x.pkg.id === tid.pkgId && x.lang === tid.lang && x.pricing === tid.pricing)
  if (!t) return jsonError(404, "no_such_template")
  const pinned = approved?.templates[`${t.id}:${size}`] ?? null
  try {
    const base = await inputFor(org.id, src, t.pkg, t.lang, t.pricing, size)
    const r = await renderFlyer({ ...base, agent: agentValuesFor(org, SAMPLE_AGENT, SAMPLE_QR_CODE), spacing: pinned?.spacing ?? null, expectHash: pinned?.hash ?? null, proof: !pinned }, output)
    return fileResponse(r, `${org.slug}-${t.id}-${size}-sample`, !pinned)
  } catch (err) {
    return renderErrorResponse(err)
  }
}
