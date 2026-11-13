import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { getOrg } from "@/lib/ap/store"
import { getOrgBlob } from "@/lib/ap/blob"
import { jsonError } from "@/lib/ap/http"

// GET /api/admin/organizations/{id}/files/{fileId} — an org file, admins only.
// Only a file recorded on THIS org is served; the path is never taken from the request.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const { id, fileId } = await params
  const org = await getOrg(id)
  const file = org && (org.logo?.id === fileId ? org.logo : org.referenceFiles.find((f) => f.id === fileId))
  if (!org || !file) return jsonError(404, "not_found")
  const blob = await getOrgBlob(org.id, file.path).catch(() => null)
  if (!blob?.stream) return jsonError(404, "not_found")
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.name.replace(/[^\x20-\x7e]/g, "_")}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
