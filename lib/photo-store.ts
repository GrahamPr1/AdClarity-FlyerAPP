import { get } from "@vercel/blob"

/**
 * The only Blob prefix /api/photos may read. The store also holds private
 * form-fill PDFs, business-profile documents and onboarding materials; the
 * public photo route must NEVER become a way to read those by guessing a
 * pathname. Both readers below — the HTTP route and the PDF renderer — go
 * through photoPathname(), so the rule lives in one place.
 */
export const PHOTO_BLOB_PREFIX = "onboarding-photos/"

/** The Blob pathname for a photo-route path, or null if it isn't one we serve. */
export function photoPathname(routePath: string): string | null {
  let pathname: string
  try {
    pathname = decodeURIComponent(routePath)
  } catch {
    return null
  }
  if (!pathname.startsWith(PHOTO_BLOB_PREFIX) || pathname.includes("..") || pathname.includes("\\")) return null
  return pathname
}

/** Streams one photo from Blob, or null if the path isn't servable or doesn't exist. */
export async function openPhoto(routePath: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const pathname = photoPathname(routePath)
  if (!pathname) return null
  const result = await get(pathname, { access: "private" }).catch(() => null)
  if (!result?.stream) return null
  return { stream: result.stream, contentType: result.blob?.contentType ?? "application/octet-stream" }
}

/** Bigger than any image we store (uploads and rehosts are capped well below this). */
const MAX_PHOTO_BYTES = 15 * 1024 * 1024

/** Reads one photo fully into memory — for the PDF renderer, which needs a body, not a stream. */
export async function readPhotoBytes(routePath: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const photo = await openPhoto(routePath)
  if (!photo) return null
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = photo.stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PHOTO_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  return { bytes: Buffer.concat(chunks), contentType: photo.contentType }
}
