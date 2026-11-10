import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { listAllAgentPrintRequests, setAgentPrintRequestStatus } from "@/lib/enterprise/portal/print-requests"

// /api/admin/enterprise/nop/print-requests — the owner or a program admin.
//   GET                                                    every agent's print requests, newest first
//   POST { email, id, status: "Fulfilled" | "Cancelled" | "Requested" }   marks one (after printing and
//                                                          shipping it outside the app, or cancelling). Logged.
export const dynamic = "force-dynamic"

const STATUSES = ["Requested", "Fulfilled", "Cancelled"] as const

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ requests: await listAllAgentPrintRequests() }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const body = (await request.json().catch(() => null)) as { email?: unknown; id?: unknown; status?: unknown } | null
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const id = typeof body?.id === "string" ? body.id : ""
  const status = STATUSES.find((s) => s === body?.status)
  if (!email || !id || !status) return NextResponse.json({ error: "invalid" }, { status: 400 })
  if (!(await setAgentPrintRequestStatus(email, id, status))) return NextResponse.json({ error: "not_found" }, { status: 404 })
  await audit(auth, "print_request.status", `${id} for ${email}: ${status}`)
  return NextResponse.json({ ok: true })
}
