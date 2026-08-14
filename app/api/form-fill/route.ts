import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { get } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getClient, seedFormFillRequest, getFormFillsForEmail, getBusinessProfile } from "@/lib/store"
import { processFormFill } from "@/lib/agent-pipeline/formFillPipeline"
import type { DocumentInput } from "@/lib/agent-pipeline/client"

const SUPPORTED_INFO_MEDIA_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_FILE_BYTES = 15 * 1024 * 1024 // generous for a form/scan, well under Vercel's 100MB request-body limit

// GET /api/form-fill — a client's own past form-fill requests. Pro-only
// feature, but reading your own (empty) list back doesn't need to be
// gated — only starting a new one does (see POST below).
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const requests = await getFormFillsForEmail(session.sub)
  return NextResponse.json({ requests })
}

// POST /api/form-fill — multipart: targetForm (required, fillable PDF),
// infoFile (optional file: PDF or image) and/or infoLink (optional URL) —
// at least one of infoFile/infoLink is required. Pro-only, enforced here
// server-side, not just hidden in the UI.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  const client = await getClient(email)
  if (client?.plan !== "pro") {
    return NextResponse.json(
      { error: "pro_only", message: "Form filling is a Pro-plan feature — check out our plans at /#pricing." },
      { status: 403 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const targetForm = formData.get("targetForm")
  const infoFile = formData.get("infoFile")
  const infoLinkRaw = formData.get("infoLink")
  const useSavedProfile = formData.get("useSavedProfile") === "true"

  if (!(targetForm instanceof File) || targetForm.size === 0) {
    return NextResponse.json({ error: "Missing required field: targetForm (a fillable PDF)" }, { status: 422 })
  }
  if (targetForm.type !== "application/pdf") {
    return NextResponse.json({ error: "targetForm must be a PDF" }, { status: 422 })
  }
  if (targetForm.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "targetForm is too large (max 15MB)" }, { status: 422 })
  }

  const targetFormBytes = new Uint8Array(await targetForm.arrayBuffer())

  let infoFileData: { bytes: Uint8Array; mediaType: DocumentInput["mediaType"] } | null = null
  let infoLink: string | null = null

  if (useSavedProfile) {
    // The saved-profile toggle is mutually exclusive with a fresh
    // infoFile/infoLink in this same submission — the UI disables those
    // fields when it's checked, so there's nothing to reconcile here.
    const profile = await getBusinessProfile(email)
    if (!profile) {
      return NextResponse.json(
        { error: "no_saved_profile", message: "You don't have a saved business profile yet — save one first, or upload a fresh info source." },
        { status: 422 },
      )
    }
    if (profile.file) {
      const blob = await get(profile.file.blobUrl, { access: "private" })
      if (!blob?.stream) {
        return NextResponse.json({ error: "Your saved profile's file is missing from storage — please re-save it." }, { status: 422 })
      }
      const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer())
      infoFileData = { bytes, mediaType: profile.file.mediaType as DocumentInput["mediaType"] }
    }
    infoLink = profile.link
  } else {
    const hasInfoFile = infoFile instanceof File && infoFile.size > 0
    const hasInfoLink = typeof infoLinkRaw === "string" && infoLinkRaw.trim().length > 0
    if (!hasInfoFile && !hasInfoLink) {
      return NextResponse.json({ error: "Provide an infoFile, an infoLink, or both" }, { status: 422 })
    }
    if (hasInfoFile) {
      if (!SUPPORTED_INFO_MEDIA_TYPES.has(infoFile.type)) {
        return NextResponse.json({ error: `infoFile must be a PDF or image (got ${infoFile.type || "an unrecognized type"})` }, { status: 422 })
      }
      if (infoFile.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "infoFile is too large (max 15MB)" }, { status: 422 })
      }
      infoFileData = { bytes: new Uint8Array(await infoFile.arrayBuffer()), mediaType: infoFile.type as DocumentInput["mediaType"] }
    }
    infoLink = hasInfoLink ? infoLinkRaw.trim() : null
  }

  const requestId = crypto.randomUUID()
  await seedFormFillRequest(email, {
    id: requestId,
    title: targetForm.name || "Untitled form",
    status: "Pending",
    createdAt: new Date().toISOString(),
  })

  waitUntil(
    processFormFill(email, requestId, targetFormBytes, infoFileData, infoLink).catch((err) => {
      console.error("[form-fill] Unhandled pipeline error:", err)
    }),
  )

  return NextResponse.json({ ok: true, id: requestId }, { status: 201 })
}
