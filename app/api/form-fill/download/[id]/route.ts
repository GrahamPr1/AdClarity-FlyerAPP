import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getFormFillsForEmail } from "@/lib/store"

// GET /api/form-fill/download/[id]
// The completed PDF is stored in Blob as `access: "private"` — deliberately
// not reachable via a bare URL, since these are filled-out personal/
// business forms. This route is the ONLY way to read one back: it checks
// the session owns this exact request before ever touching Blob.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const requests = await getFormFillsForEmail(session.sub)
  const match = requests.find((r) => r.id === id)

  if (!match || match.status !== "Ready" || !match.resultUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const result = await get(match.resultUrl, { access: "private" })
  if (!result || !result.stream) {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 })
  }

  const filename = `${match.title.replace(/\.pdf$/i, "").replace(/[^a-z0-9.-]+/gi, "-")}-filled.pdf`
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
