import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"

// GET /api/photos/[...path] — public, unauthenticated read-through for
// onboarding photos stored privately in Blob (see /api/onboarding/upload-photo
// for why they're private-but-proxied rather than a public store). Scoped
// hard to the "onboarding-photos/" prefix — this must NEVER become a way to
// read any other private blob in the same store (form-fill PDFs,
// business-profile documents) just by guessing its pathname.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const pathname = path.join("/")

  if (!pathname.startsWith("onboarding-photos/") || pathname.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const result = await get(pathname, { access: "private" }).catch(() => null)
  if (!result?.stream) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
