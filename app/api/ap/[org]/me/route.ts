import { NextResponse, type NextRequest } from "next/server"
import { requireOrgAgent } from "@/lib/ap/tenant"
import { getOrIssueQrCode, getOrIssueRecruitCode } from "@/lib/ap/store"
import { enrollmentUrlFor } from "@/lib/ap/validate"
import { qrLink, recruitLink } from "@/lib/ap/links"
import { noStore } from "@/lib/ap/http"

// GET /api/ap/{org}/me — the signed-in agent's own record and links.
// Everything comes from the session's agent (requireOrgAgent): there is no
// parameter that could name another agent or org.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const g = await requireOrgAgent(request, (await params).org)
  if ("response" in g) return g.response
  const { org, agent } = g
  const [qr, recruit] = await Promise.all([getOrIssueQrCode(agent), getOrIssueRecruitCode(agent)])
  return NextResponse.json(
    {
      org: { slug: org.slug, name: org.name },
      agent: { agentId: agent.agentId, externalId: agent.externalId, name: agent.name, phone: agent.phone, email: agent.email, lang: agent.lang, tier: agent.tier, status: agent.status },
      links: { enrollment: enrollmentUrlFor(org.enrollment, agent.externalId), qr: qrLink(qr), recruit: recruitLink(org, recruit) },
    },
    { headers: noStore },
  )
}
