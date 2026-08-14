import { NextRequest, NextResponse } from "next/server"
import { put, del } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getClient, getBusinessProfile, saveBusinessProfile, deleteBusinessProfile } from "@/lib/store"

const SUPPORTED_MEDIA_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_FILE_BYTES = 15 * 1024 * 1024

// GET /api/business-profile — a client's own saved profile (or null). Same
// read-is-ungated pattern as GET /api/form-fill.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const profile = await getBusinessProfile(session.sub)
  return NextResponse.json({ profile })
}

// POST /api/business-profile — multipart: file (optional) and/or link
// (optional), at least one required. Pro-only, enforced here. Replaces any
// existing saved profile, deleting its old file blob if it had one.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  const client = await getClient(email)
  if (client?.plan !== "pro") {
    return NextResponse.json(
      { error: "pro_only", message: "Saved business profiles are a Pro-plan feature — check out our plans at /#pricing." },
      { status: 403 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const file = formData.get("file")
  const linkRaw = formData.get("link")

  const hasFile = file instanceof File && file.size > 0
  const hasLink = typeof linkRaw === "string" && linkRaw.trim().length > 0
  if (!hasFile && !hasLink) {
    return NextResponse.json({ error: "Provide a file, a link, or both" }, { status: 422 })
  }

  if (hasFile) {
    if (!SUPPORTED_MEDIA_TYPES.has(file.type)) {
      return NextResponse.json({ error: `file must be a PDF or image (got ${file.type || "an unrecognized type"})` }, { status: 422 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "file is too large (max 15MB)" }, { status: 422 })
    }
  }

  const existing = await getBusinessProfile(email)

  let fileRecord: { blobUrl: string; mediaType: string; fileName: string } | null = existing?.file ?? null
  if (hasFile && file instanceof File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const blob = await put(`business-profiles/${email}/${Date.now()}-${file.name}`, Buffer.from(bytes), {
      access: "private",
      contentType: file.type,
      addRandomSuffix: false,
    })
    if (existing?.file?.blobUrl) {
      await del(existing.file.blobUrl).catch((e) => console.error("[business-profile] Failed to delete old file blob:", e))
    }
    fileRecord = { blobUrl: blob.url, mediaType: file.type, fileName: file.name }
  }

  const profile = {
    savedAt: new Date().toISOString(),
    link: hasLink && typeof linkRaw === "string" ? linkRaw.trim() : (existing?.link ?? null),
    file: fileRecord,
  }
  await saveBusinessProfile(email, profile)

  return NextResponse.json({ ok: true, profile })
}

// DELETE /api/business-profile — clears the saved profile and its file blob, if any.
export async function DELETE(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  const existing = await getBusinessProfile(email)
  if (existing?.file?.blobUrl) {
    await del(existing.file.blobUrl).catch((e) => console.error("[business-profile] Failed to delete file blob:", e))
  }
  await deleteBusinessProfile(email)

  return NextResponse.json({ ok: true })
}
