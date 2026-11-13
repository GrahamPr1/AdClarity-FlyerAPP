import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { getContent, getOrg } from "@/lib/ap/store"
import { buildTemplate } from "@/lib/ap/package-file"
import { jsonError, noStore } from "@/lib/ap/http"

// GET /api/admin/organizations/{id}/packages/template — the package spreadsheet
// (.xlsx), generated from the slot definitions. One sheet per draft package;
// Spanish column only when the org has Spanish on.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  const packages = (await getContent(org.id))?.packages ?? []
  const file = buildTemplate(org.languages, packages)
  return new NextResponse(new Uint8Array(file), {
    headers: {
      ...noStore,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${org.slug}-packages.xlsx"`,
    },
  })
}
