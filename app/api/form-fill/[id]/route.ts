import { NextRequest, NextResponse } from "next/server"
import { del, list } from "@vercel/blob"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { deleteFormFillRequest, getFormFillsForEmail } from "@/lib/store"

// DELETE /api/form-fill/[id] — removes one of the caller's own form-fill jobs
// and its files in Blob.
//
// Owner only: the job is looked up in the SESSION's own list, so another
// account's id is simply "not found" (404, which also says nothing about
// whether it exists). Admin has no list of its own and is refused.
//
// Ready or Failed only. A job still running would upload its finished PDF
// after the delete and leave an orphaned private file behind.
//
// Files: the filled PDF lives at form-fills/<email>/<id>.pdf (see
// formFillPipeline.ts). The uploaded form and info file are never stored, so
// that path is everything. Deleted by listing the job's own prefix rather
// than trusting resultUrl alone, so a file whose record update was lost is
// still removed.
export const dynamic = "force-dynamic"

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub
  const { id } = await params

  const job = (await getFormFillsForEmail(email)).find((r) => r.id === id)
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (job.status !== "Ready" && job.status !== "Failed") {
    return NextResponse.json({ error: "This form is still being filled. Delete it once it's finished." }, { status: 409 })
  }

  // Files first: if Blob fails, the job stays listed and can be retried,
  // rather than leaving a private PDF with no record pointing at it.
  try {
    const { blobs } = await list({ prefix: `form-fills/${email}/${id}` })
    const urls = new Set(blobs.filter((b) => b.pathname.startsWith(`form-fills/${email}/${id}.`)).map((b) => b.url))
    if (job.resultUrl) urls.add(job.resultUrl)
    if (urls.size) await del([...urls])
  } catch (err) {
    console.error(`[form-fill] delete ${id}: Blob delete failed`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Couldn't delete the file. Please try again." }, { status: 502 })
  }

  await deleteFormFillRequest(email, id)
  return NextResponse.json({ ok: true })
}
