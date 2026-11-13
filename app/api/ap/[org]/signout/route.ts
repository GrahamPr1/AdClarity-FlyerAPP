import { NextResponse, type NextRequest } from "next/server"
import { requireOrg } from "@/lib/ap/tenant"
import { clearApSessionCookie } from "@/lib/ap/session"
import { noStore } from "@/lib/ap/http"

// POST /api/ap/{org}/signout — clears the platform session cookie.
export const dynamic = "force-dynamic"

export async function POST(_request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const o = await requireOrg((await params).org)
  if ("response" in o) return o.response
  const res = NextResponse.json({ ok: true }, { headers: noStore })
  clearApSessionCookie(res)
  return res
}
