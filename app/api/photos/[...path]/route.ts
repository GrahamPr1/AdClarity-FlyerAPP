import { NextRequest, NextResponse } from "next/server"
import { openPhoto } from "@/lib/photo-store"

// GET /api/photos/[...path] — public, unauthenticated read-through for
// onboarding photos stored privately in Blob (see /api/onboarding/upload-photo
// for why they're private-but-proxied rather than a public store). Scoped
// hard to the "onboarding-photos/" prefix — this must NEVER become a way to
// read any other private blob in the same store (form-fill PDFs,
// business-profile documents) just by guessing its pathname.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  // Prefix and traversal rules live in lib/photo-store (shared with the PDF
  // renderer, which reads the same files without going through HTTP).
  const photo = await openPhoto(path.join("/"))
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return new NextResponse(photo.stream, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
