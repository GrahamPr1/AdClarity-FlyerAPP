import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"

const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_FILE_BYTES = 10 * 1024 * 1024

// POST /api/onboarding/upload-photo — a real photo upload for a client's
// own flyers, used during onboarding. Public access (unlike form-fill's
// private documents): these URLs get embedded directly in generated flyer
// HTML via <img src>, the same way a client-supplied photo already worked
// once it had a real URL — nothing sensitive about a storefront photo.
// Available on every plan; this is fixing broken upload capture, not a new
// paid feature (see the note on IntakeSubmission.flyerPhotoUrls).
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

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

  const bytes = new Uint8Array(await file.arrayBuffer())
  const blob = await put(`onboarding-photos/${email}/${Date.now()}-${file.name}`, Buffer.from(bytes), {
    access: "public",
    contentType: file.type,
    addRandomSuffix: false,
  })

  return NextResponse.json({ ok: true, url: blob.url })
}
