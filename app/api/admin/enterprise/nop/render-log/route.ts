import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { AGENT_ID_RE } from "@/lib/enterprise/nop-roster"
import { countNopRenders, listNopRenders, nopRenderLogCsv } from "@/lib/enterprise/nop-render/log"

// GET /api/admin/enterprise/nop/render-log?agentId=858980&limit=200
//   -> { entries (newest first), total }
// GET /api/admin/enterprise/nop/render-log?format=csv[&agentId=…]
//   -> the COMPLETE log (or one agent's complete history) as CSV, oldest
//      first. The contract requires exporting this at termination.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const agentId = url.searchParams.get("agentId")?.trim() || undefined
  if (agentId && !AGENT_ID_RE.test(agentId)) return NextResponse.json({ error: "Invalid Agent ID" }, { status: 422 })

  if (url.searchParams.get("format") === "csv") {
    const csv = nopRenderLogCsv(await listNopRenders({ agentId }))
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nop-generation-log${agentId ? `-${agentId}` : ""}-${date}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 1000)
  const [entries, total] = await Promise.all([listNopRenders({ agentId, limit }), countNopRenders(agentId)])
  return NextResponse.json({ entries, total }, { headers: { "Cache-Control": "no-store" } })
}
