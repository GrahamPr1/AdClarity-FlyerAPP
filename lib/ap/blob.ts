import { del, get, put } from "@vercel/blob"
import { assertBlobMatchesEnvironment } from "@/lib/blob-env"
import { getAppEnvironment } from "@/lib/env"

// Every Blob write the agent platform makes. Paths are always
// ap/orgs/{orgId}/..., in oneflyer-nonprod (the Development/Preview token).
//
// Never oneflyer-forms: writes are refused outright when this process is
// production (the only environment holding that store's token), on top of
// the store-marker guard. Lifting that is a launch decision, not a default.

export const AP_BLOB_ROOT = "ap/"

export function orgBlobPrefix(orgId: string): string {
  return `${AP_BLOB_ROOT}orgs/${orgId}/`
}

function assertApPath(path: string, orgId: string): void {
  const prefix = orgBlobPrefix(orgId)
  if (!path.startsWith(prefix) || path.includes("..") || path.includes("//")) throw new Error(`refusing Blob path outside ${prefix}: ${path}`)
}

export async function putOrgBlob(orgId: string, path: string, body: Buffer, contentType: string): Promise<void> {
  assertApPath(path, orgId)
  if (getAppEnvironment() === "production") throw new Error("agent platform Blob writes are refused in production (oneflyer-forms)")
  await assertBlobMatchesEnvironment()
  await put(path, body, { access: "private", contentType, addRandomSuffix: false })
}

export async function getOrgBlob(orgId: string, path: string) {
  assertApPath(path, orgId)
  return get(path, { access: "private" })
}

export async function deleteOrgBlob(orgId: string, path: string): Promise<void> {
  assertApPath(path, orgId)
  if (getAppEnvironment() === "production") throw new Error("agent platform Blob writes are refused in production (oneflyer-forms)")
  await del(path)
}
