import { NextRequest, NextResponse } from "next/server"
import { audit, requireNopAdmin } from "@/lib/enterprise/program-admins"
import { DEFAULT_ENROLL_DOMAIN } from "@/lib/enterprise/nop-roster"
import { ENROLL_CHECK_AGENT_ID, checkEnrollDomain, enrollUrlsToCheck, getEnrollDomain, listEnrollDomainLog, setEnrollDomain } from "@/lib/enterprise/nop-enroll-domain"

// GET  /api/admin/enterprise/nop/enroll-domain -> the domain, what a test agent's QR forwards to,
//      whether those URLs load right now, and every change
// POST /api/admin/enterprise/nop/enroll-domain { domain } -> saved only if the URLs load (live check)
// OneFlyer admin only.
export const dynamic = "force-dynamic"

async function state() {
  const domain = await getEnrollDomain()
  const [live, log] = await Promise.all([checkEnrollDomain(domain), listEnrollDomainLog()])
  return { domain, defaultDomain: DEFAULT_ENROLL_DOMAIN, testAgentId: ENROLL_CHECK_AGENT_ID, urls: enrollUrlsToCheck(domain), live, log }
}

export async function GET(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  return NextResponse.json(await state(), { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const auth = await requireNopAdmin(request)
  if ("response" in auth) return auth.response
  let body: { domain?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (typeof body.domain !== "string") return NextResponse.json({ error: "invalid", message: "Enter a domain." }, { status: 422 })
  const out = await setEnrollDomain(body.domain, auth.admin)
  if (!out.ok) {
    const message =
      out.reason === "invalid" ? "Enter a basicbenefits.com host only, like neighbor.basicbenefits.com (no https://, path or port)."
      : out.reason === "link_too_long" ? `That domain makes the printed link about ${out.linkWidthPx}px wide for a 10-digit Agent ID; the kit-v2 footer has ${out.spacePx}px.`
      : "Not saved: these don't load right now."
    return NextResponse.json({ error: out.reason, message, checks: out.checks ?? [] }, { status: 422 })
  }
  await audit(auth, "enroll_domain", `${out.entry.from} -> ${out.entry.to}`)
  return NextResponse.json({ saved: out.entry, ...(await state()) })
}
