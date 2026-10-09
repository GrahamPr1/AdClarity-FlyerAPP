import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { normalizeEmail } from "@/lib/enterprise/nop-roster"
import { listAgentFlags } from "@/lib/enterprise/agents-store"
import { convertToAgentAccount, describeBlockedAccount, listConversions } from "@/lib/enterprise/account-conversion"

// GET  /api/admin/enterprise/nop/convert              -> roster emails currently blocked by a business account
//                                                       (from the business_account_conflict flags) + past conversions
// GET  /api/admin/enterprise/nop/convert?email=…      -> one email: plan, flyers, and whether it can be converted
// POST /api/admin/enterprise/nop/convert { email, confirm: true } -> convert it to an agent account
//
// Same isAdminSession gate as the other NOP admin routes (NOP org admins get
// it with that console, on the nop-admin branch).

async function requireAdmin(request: NextRequest) {
  const session = await getSessionIdentity(request)
  return isAdminSession(session?.sub)
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const email = new URL(request.url).searchParams.get("email")
  if (email) return NextResponse.json(await describeBlockedAccount(normalizeEmail(email)), { headers: { "Cache-Control": "no-store" } })

  const flagged = [...new Set((await listAgentFlags()).filter((f) => f.type === "business_account_conflict").map((f) => f.account))]
  const described = await Promise.all(flagged.map(describeBlockedAccount))
  return NextResponse.json(
    { blocked: described.filter((d) => d.blocks && d.agentId && !d.heldAgentId), conversions: await listConversions() },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let body: { email?: unknown; confirm?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (body.confirm !== true) return NextResponse.json({ error: "Confirm the conversion first." }, { status: 422 })
  const out = await convertToAgentAccount(normalizeEmail(String(body.email ?? "")), "owner")
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 409 })
  return NextResponse.json(out)
}
