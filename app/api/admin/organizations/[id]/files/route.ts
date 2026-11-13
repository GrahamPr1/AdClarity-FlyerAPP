import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { getOrg, newId, setOrgFiles } from "@/lib/ap/store"
import { deleteOrgBlob, orgBlobPrefix, putOrgBlob } from "@/lib/ap/blob"
import { EXT, checkUpload, safeFileName } from "@/lib/ap/files"
import { jsonError, noStore } from "@/lib/ap/http"
import type { ApFileRef } from "@/lib/ap/types"

// POST   /api/admin/organizations/{id}/files   multipart: kind=logo|reference, file
// DELETE /api/admin/organizations/{id}/files?fileId=…
// Files land at ap/orgs/{orgId}/{logo|reference}/{fileId}.{ext} in oneflyer-nonprod.
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")

  const form = await request.formData().catch(() => null)
  const kind = form?.get("kind")
  const file = form?.get("file")
  if ((kind !== "logo" && kind !== "reference") || !(file instanceof File)) return jsonError(422, "invalid", { message: "Send kind (logo or reference) and a file." })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkUpload(kind, bytes)
  if (!check.ok) return jsonError(422, "invalid", { field: "file", message: check.error })

  const id = newId("file")
  const ref: ApFileRef = {
    id,
    path: `${orgBlobPrefix(org.id)}${kind}/${id}.${EXT[check.type]}`,
    name: safeFileName(file.name),
    contentType: check.type,
    size: bytes.length,
    uploadedBy: a.admin,
    uploadedAt: new Date().toISOString(),
  }
  await putOrgBlob(org.id, ref.path, Buffer.from(bytes), check.type)
  const previousLogo = kind === "logo" ? org.logo : null
  const next = await setOrgFiles(org.id, kind === "logo" ? { logo: ref } : { addReference: ref }, a.admin)
  if (previousLogo) await deleteOrgBlob(org.id, previousLogo.path).catch((err) => console.error("[ap] old logo delete failed:", err))
  return NextResponse.json({ org: next, file: ref }, { status: 201, headers: noStore })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  const fileId = request.nextUrl.searchParams.get("fileId") ?? ""
  const target = org.logo?.id === fileId ? org.logo : org.referenceFiles.find((f) => f.id === fileId)
  if (!target) return jsonError(404, "not_found")
  await deleteOrgBlob(org.id, target.path)
  const next = await setOrgFiles(org.id, org.logo?.id === fileId ? { logo: null } : { removeReference: fileId }, a.admin)
  return NextResponse.json({ org: next }, { headers: noStore })
}
