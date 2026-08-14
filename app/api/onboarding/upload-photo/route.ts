import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getSiteUrl } from "@/lib/site-url"

const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_FILE_BYTES = 10 * 1024 * 1024

// POST /api/onboarding/upload-photo — a real photo upload for a client's
// own flyers, used during onboarding.
//
// Stored PRIVATE (the only access mode this project's Blob store actually
// supports — it was provisioned private for form-fill, and Vercel Blob
// stores don't support mixed public/private access per upload; a second
// store would need its own read-write token under a different env var
// name, which the CLI has no way to wire up without dashboard access this
// session doesn't have). Read back through /api/photos/[...path] instead —
// a real proxy, not the raw private blob URL, but deliberately
// UNAUTHENTICATED (unlike form-fill's download route): these photos get
// embedded in flyer HTML that a customer with no OneFlyer account needs to
// be able to view (e.g. a flyer they were handed or emailed), so gating
// the read behind a login would break the actual use case.
//
// Available on every plan; this is fixing broken upload capture, not a new
// paid feature (see the note on IntakeSubmission.flyerPhotoUrls).
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing required field: file" }, { status: 422 })
  }
  if (!SUPPORTED_MEDIA_TYPES.has(file.type)) {
    return NextResponse.json({ error: `file must be a photo (got ${file.type || "an unrecognized type"})` }, { status: 422 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file is too large (max 10MB)" }, { status: 422 })
  }

  // Random, not email-derived — this pathname is embedded in a URL that's
  // reachable with no auth check (see the proxy route), so it shouldn't
  // leak whose email uploaded it.
  const pathname = `onboarding-photos/${crypto.randomUUID()}-${file.name}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  await put(pathname, Buffer.from(bytes), {
    access: "private",
    contentType: file.type,
    addRandomSuffix: false,
  })

  // Must be absolute: the flyer's downloadUrl is a data: URI (see toDataUrl
  // in pipeline.ts), which has no real origin to resolve a relative path
  // against — a relative "/api/photos/..." src silently fails to load
  // inside it. Same reasoning as the QR code's redeem URL (see
  // lib/site-url.ts) — pinned to the real deployed domain, not
  // request-relative.
  return NextResponse.json({ ok: true, url: `${getSiteUrl()}/api/photos/${pathname}` })
}
