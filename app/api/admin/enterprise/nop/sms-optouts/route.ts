import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { addSmsOptOut, listSmsOptOuts } from "@/lib/enterprise/sms-optout"

// /api/admin/enterprise/nop/sms-optouts — the owner or a program admin.
//   GET                       every opted-out number, newest first
//   POST { phone, note? }     adds a number (someone asked not to be texted). Add-only. Logged.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json({ optOuts: await listSmsOptOuts() }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  const body = (await request.json().catch(() => null)) as { phone?: unknown; note?: unknown } | null
  const out = await addSmsOptOut(typeof body?.phone === "string" ? body.phone : "", auth.admin, typeof body?.note === "string" ? body.note : null)
  if (!out.ok) return NextResponse.json({ error: out.reason, message: "Enter a 10-digit US phone number." }, { status: 422 })
  // The number itself isn't written to the admin log; the opt-out list keeps it.
  if (!out.already) await audit(auth, "sms_optout.add", `number ending ${out.optOut.phone.slice(-4)}`)
  return NextResponse.json({ ok: true, already: out.already, optOut: out.optOut })
}
