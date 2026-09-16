import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { loadEnterpriseDemoData } from "@/app/admin/enterprise-demo/data"

/**
 * GET /api/admin/enterprise-demo?email=...
 *
 * Read-only. Returns the demo agent's most recent flyer together with the
 * per-block provenance the Sources panel renders. Used for polling while a
 * generation runs; the first paint comes from the server component.
 *
 * There is deliberately no POST here. Generation goes through the real
 * /api/intake route, which already permits an admin session to submit on
 * behalf of another email — so the demo exercises the production path end to
 * end rather than a parallel one built to make the demo look good. A second
 * generation entry point would be the easiest way to ship a demo that passes
 * while the real path is broken.
 */
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isAdminSession(session.sub))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 })

  return NextResponse.json(await loadEnterpriseDemoData(email))
}
