import { NextRequest, NextResponse } from "next/server"
import { requireAgentFeature } from "@/lib/enterprise/portal/api"
import { rejectWhileViewingAs } from "@/lib/enterprise/portal/view-as"
import { getNopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { nopLangForRequest } from "@/lib/enterprise/nop-i18n/server"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { checkPrintRequest, createAgentPrintRequest, listAgentPrintRequests } from "@/lib/enterprise/portal/print-requests"

// GET  /api/enterprise/agent/print-requests -> the agent's print requests, newest first
// POST /api/enterprise/agent/print-requests { template, quantity, shippingName, shippingAddress, notes? }
// Active Pro/Leader agents whose org has print requests on (canUse). Not an order:
// nothing is printed or charged here (print-requests.ts). Never while an admin views the portal.
export const dynamic = "force-dynamic"

const FIELD_ERROR: Record<string, NopStringKey> = {
  template: "print.err_template", quantity: "print.err_quantity", shippingName: "print.err_name", shippingAddress: "print.err_address", notes: "print.err_notes",
}

export async function GET(request: NextRequest) {
  const r = await requireAgentFeature(request, "printRequests")
  if ("response" in r) return r.response
  return NextResponse.json({ requests: await listAgentPrintRequests(r.ctx.email) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const readOnly = rejectWhileViewingAs(request)
  if (readOnly) return readOnly
  const r = await requireAgentFeature(request, "printRequests")
  if ("response" in r) return r.response
  const lang = await nopLangForRequest(request, r.ctx.email)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const check = checkPrintRequest(body ?? {}, await getNopFlyerSettings())
  if (!check.ok) return NextResponse.json({ error: "invalid", field: check.field, message: tNop(lang, FIELD_ERROR[check.field]) }, { status: 422 })
  const created = await createAgentPrintRequest(r.ctx.email, check.value)
  return NextResponse.json({ ok: true, request: created }, { status: 201 })
}
