import { NextResponse, type NextRequest } from "next/server"
import { requireApAdmin } from "@/lib/ap/tenant"
import { getContent, getOrg, saveContent } from "@/lib/ap/store"
import { describeProblem, parsePackageFile, type ImportProblem } from "@/lib/ap/package-file"
import { checkFit } from "@/lib/ap/flyers"
import { jsonError, noStore } from "@/lib/ap/http"

// POST /api/admin/organizations/{id}/packages/import  multipart: file (.xlsx or .csv)
//
// Fills the DRAFT only (never the approved version), through exactly the
// manual-save checks: every slot's budget, required slots, prices, the
// Basic Benefits text guard, then the real-render fit check. The whole file
// is refused if anything fails, with EVERY problem listed by sheet, row and key.
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_BYTES = 2 * 1024 * 1024

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireApAdmin(request)
  if ("response" in a) return a.response
  const org = await getOrg((await params).id)
  if (!org) return jsonError(404, "not_found")
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return jsonError(422, "invalid", { message: "Choose a .xlsx or .csv file." })
  if (!/\.(xlsx|csv)$/i.test(file.name)) return jsonError(422, "invalid", { message: "Only .xlsx or .csv files." })
  if (file.size > MAX_BYTES) return jsonError(422, "invalid", { message: "At most 2 MB." })

  const draft = (await getContent(org.id))?.packages ?? []
  const parsed = parsePackageFile({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, org.languages, draft)
  if (!parsed.ok) return jsonError(422, "import_rejected", { problems: parsed.problems, messages: parsed.problems.map(describeProblem) })

  const fit = await checkFit(org, parsed.packages)
  if (fit.length) {
    const problems: ImportProblem[] = fit.map((p) => {
      const loc = parsed.where.get(p.package)
      return { sheet: loc?.sheet ?? p.package, row: p.slot && loc ? loc.rows[p.slot] ?? null : null, key: p.slot ?? null, lang: p.lang, error: p.message }
    })
    return jsonError(422, "import_rejected", { problems, messages: problems.map(describeProblem) })
  }
  const content = await saveContent(org.id, parsed.packages, a.admin)
  return NextResponse.json({ content }, { headers: noStore })
}
