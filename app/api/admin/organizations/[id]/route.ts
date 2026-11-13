import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { checkOrgConfig } from "@/lib/ap/validate"
import { getOrg, listOrgAgents, listOrgLog, updateOrgConfig } from "@/lib/ap/store"
import { signupLink } from "@/lib/ap/links"
import { jsonError, noStore, readJson } from "@/lib/ap/http"

// GET   /api/admin/organizations/{id}   the org, its agents, its change log, its sign-up link
// PATCH /api/admin/organizations/{id}   replace the editable config (same shape as create)
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  const [agents, log] = await Promise.all([listOrgAgents(org.id), listOrgLog(org.id)])
  return NextResponse.json({ org, agents, log, signupLink: signupLink(org) }, { headers: noStore })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const input = checkOrgConfig(await readJson(request))
  if (!input.ok) return jsonError(422, "invalid", { field: input.field, message: input.error })
  const out = await updateOrgConfig((await params).id, input.value, a.admin)
  if (!out.ok) return out.error === "not_found" ? jsonError(404, "not_found") : jsonError(409, out.error, { field: "slug", message: "That slug is taken." })
  return NextResponse.json({ org: out.org }, { headers: noStore })
}
