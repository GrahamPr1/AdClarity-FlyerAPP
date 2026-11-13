import { NextResponse, type NextRequest } from "next/server"
import { requireOrgAgent } from "@/lib/ap/tenant"
import { getApproved, getContent } from "@/lib/ap/store"
import { templatesFor } from "@/lib/ap/templates/content"
import { sourceFromApproved, sourceFromOrg } from "@/lib/ap/flyers"
import { noStore } from "@/lib/ap/http"

// GET /api/ap/{org}/flyers — the signed-in agent's flyers: the org's approved
// version, or (no approval yet) PROOFs of its draft. Only the org's enabled languages.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const g = await requireOrgAgent(request, (await params).org)
  if ("response" in g) return g.response
  const { org } = g
  const approved = await getApproved(org.id)
  const src = approved ? sourceFromApproved(approved, org) : sourceFromOrg(org, (await getContent(org.id))?.packages ?? [])
  const flyers = templatesFor(src.packages, src.languages).map((t) => ({
    id: t.id,
    layout: t.pkg.layout,
    lang: t.lang,
    pricing: t.pricing,
    label: `${t.pkg.variants[t.lang]!["header.packageLabel"]}: ${t.pkg.variants[t.lang]!["header.titleLine1"]} ${t.pkg.variants[t.lang]!["header.titleLine2"]}`,
  }))
  return NextResponse.json({ proof: !approved, version: approved?.version ?? null, flyers }, { headers: noStore })
}
