import type { NextRequest } from "next/server"
import { requireOrgAgent } from "@/lib/ap/tenant"
import { getApproved, getContent } from "@/lib/ap/store"
import { parseTemplateId, templatesFor } from "@/lib/ap/templates/content"
import { renderForAgent, sourceFromApproved, sourceFromOrg } from "@/lib/ap/flyers"
import { fileResponse, parseOutput, parseSize, renderErrorResponse } from "@/lib/ap/flyer-http"
import { jsonError } from "@/lib/ap/http"

// GET /api/ap/{org}/flyers/{template}?size=letter|bleed&format=pdf|png|thumb
// One flyer with the signed-in agent's own name, phone, link and QR. The
// agent, the org and the content all come from the session's org
// (requireOrgAgent): a template id from another org simply isn't found.
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest, { params }: { params: Promise<{ org: string; template: string }> }) {
  const { org: slug, template } = await params
  const g = await requireOrgAgent(request, slug)
  if ("response" in g) return g.response
  const { org, agent } = g
  const tid = parseTemplateId(template)
  const size = parseSize(request.nextUrl.searchParams.get("size"))
  const output = parseOutput(request.nextUrl.searchParams.get("format"))
  if (!tid || !size || !output) return jsonError(422, "invalid")

  const approved = await getApproved(org.id)
  const draft = approved ? null : (await getContent(org.id))?.packages ?? []
  const src = approved ? sourceFromApproved(approved, org) : sourceFromOrg(org, draft!)
  const t = templatesFor(src.packages, src.languages).find((x) => x.pkg.id === tid.pkgId && x.lang === tid.lang && x.pricing === tid.pricing)
  if (!t) return jsonError(404, "not_found")
  try {
    const r = await renderForAgent(org, agent, approved ? { approved } : { draft: draft! }, t, size, output)
    return fileResponse(r, `${org.slug}-${t.id}-${size}`, !approved)
  } catch (err) {
    return renderErrorResponse(err)
  }
}
