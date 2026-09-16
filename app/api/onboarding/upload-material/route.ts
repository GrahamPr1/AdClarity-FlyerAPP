import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getSiteUrl } from "@/lib/site-url"
import { recordMaterialOwner } from "@/lib/store"

const SUPPORTED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])
const MAX_FILE_BYTES = 15 * 1024 * 1024

// POST /api/onboarding/upload-material — a real upload for the "existing
// marketing materials" field in onboarding.
//
// Mirrors /api/onboarding/upload-photo, with one deliberate difference: the
// read route is AUTHENTICATED. Photos are served unauthenticated because they
// get embedded in flyer HTML a recipient with no account has to be able to
// view. Existing materials are the opposite — a client's brochures, price
// lists and past campaigns — so serving them from an open URL would be a
// privacy regression, not a convenience.
//
// Available on every plan: this is fixing broken upload capture, not a new
// paid feature. Before this, the field captured file.name and threw the File
// away, exactly as the logo field did.
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
    return NextResponse.json(
      { error: `file must be a PDF or an image (got ${file.type || "an unrecognized type"})` },
      { status: 422 },
    )
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file is too large (max 15MB)" }, { status: 422 })
  }

  // Random rather than email-derived, same reasoning as the photo upload: the
  // pathname travels in a URL and shouldn't leak whose account it belongs to.
  const pathname = `onboarding-materials/${crypto.randomUUID()}-${file.name}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  await put(pathname, Buffer.from(bytes), {
    access: "private",
    contentType: file.type,
    addRandomSuffix: false,
  })

  // The ownership record IS the access control for the read route — a random
  // pathname is not a permission.
  await recordMaterialOwner(pathname, session.sub)

  return NextResponse.json({ ok: true, url: `${getSiteUrl()}/api/onboarding/material/${pathname}` })
}
