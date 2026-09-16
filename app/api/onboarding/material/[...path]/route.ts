import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { getMaterialOwner } from "@/lib/store"

// GET /api/onboarding/material/<pathname> — reads back a client's own
// uploaded material.
//
// AUTHENTICATED and ownership-checked, unlike /api/photos/[...path]. These are
// a client's private business documents; the random pathname is obscurity, not
// authorisation. Admins can read them for support, the same allowance every
// other /api/admin surface has.
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getSessionIdentity(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { path } = await params
  const pathname = path.join("/")

  // Same prefix/traversal guard as the photos proxy — without it this route
  // reads any blob in the store.
  if (!pathname.startsWith("onboarding-materials/") || pathname.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const owner = await getMaterialOwner(pathname)
  const allowed = owner === session.sub || session.sub === ADMIN_SUB || (await isAdminSession(session.sub))
  if (!owner || !allowed) {
    // 404 rather than 403: a client probing for someone else's upload learns
    // nothing about whether it exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const result = await get(pathname, { access: "private" }).catch(() => null)
  if (!result?.stream) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  })
}
