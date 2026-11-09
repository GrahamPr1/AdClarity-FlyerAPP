import { NextRequest, NextResponse } from "next/server"
import { del, put } from "@vercel/blob"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { canUse } from "@/lib/enterprise/portal/features"
import { AGENT_PHOTO_PREFIX, MAX_AGENT_PHOTO_BYTES, setAgentPagePhoto, sniffPhotoType, type AgentPagePhoto } from "@/lib/enterprise/portal/agent-page"

// POST   /api/enterprise/agent/page/photo (multipart "file") -> replace the photo
// DELETE /api/enterprise/agent/page/photo                    -> remove it
//
// Both need the agent page AND the org's photo switch (off by default); with
// the switch off there is nothing to upload to. Never while an admin is
// viewing as the agent. Stored private in Blob under a random name and read
// only through /p/{code}/photo, which checks the switches on every request.
// The type is taken from the file's bytes, not the browser's claim.

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const

async function gate(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return { response: readOnly }
  const r = await requireAgentFeature(request, "agentPage")
  if ("response" in r) return r
  if (!canUse(r.ctx, "agentPhoto")) return { response: NextResponse.json({ error: "not_available", feature: "agentPhoto" }, { status: 403 }) }
  return r
}

async function removeBlob(photo: AgentPagePhoto | null) {
  if (!photo) return
  await del(photo.path).catch((err) => console.error(`[agent-page] couldn't delete old photo ${photo.path}:`, err))
}

export async function POST(request: NextRequest) {
  const r = await gate(request)
  if ("response" in r) return r.response
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "missing_file" }, { status: 422 })
  if (file.size > MAX_AGENT_PHOTO_BYTES) return NextResponse.json({ error: "too_large" }, { status: 422 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffPhotoType(bytes)
  if (!type) return NextResponse.json({ error: "not_a_photo" }, { status: 422 })

  const path = `${AGENT_PHOTO_PREFIX}${crypto.randomUUID()}.${EXT[type]}`
  await put(path, Buffer.from(bytes), { access: "private", contentType: type, addRandomSuffix: false })
  const { replaced } = await setAgentPagePhoto(r.ctx.agent.agentId, { path, contentType: type, updatedAt: new Date().toISOString() })
  await removeBlob(replaced)
  return NextResponse.json({ ok: true, hasPhoto: true })
}

export async function DELETE(request: NextRequest) {
  const r = await gate(request)
  if ("response" in r) return r.response
  const { replaced } = await setAgentPagePhoto(r.ctx.agent.agentId, null)
  await removeBlob(replaced)
  return NextResponse.json({ ok: true, hasPhoto: false })
}
