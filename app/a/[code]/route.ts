import { NextResponse, type NextRequest } from "next/server"
import { programEnrollmentUrl } from "@/lib/enterprise/nop-roster"
import { getEnrollDomain } from "@/lib/enterprise/nop-enroll-domain"
import { DEFAULT_ENROLL_DOMAIN } from "@/lib/enterprise/nop-roster"
import { countAgentScan } from "@/lib/enterprise/portal/agent-data"
import { qrLanding } from "@/lib/enterprise/portal/lead-capture"

// GET /a/{code} — what a NOP agent's flyer QR encodes. The code is random and
// maps to one Agent ID (lib/enterprise/nop-qr-code.ts). By default it forwards
// at once to the agent's enrollment URL while their roster record is active,
// otherwise to the program's enrollment page; an unknown code goes to the
// program's page too. Only when the agent's org has switched on the QR lead
// page (and they're an active Pro/Leader with lead capture) does it open
// /a/{code}/contact instead (qrLanding).
//
// 302 and no-store, never a permanent redirect: the destination follows the
// agent's roster status and switches at the moment of the scan. A failed
// lookup forwards to the program's page: the visitor still reaches
// enrollment, and no agent is credited on a guess.
//
// Each GET is one scan for that Agent ID, whatever the agent's tier or status
// (only active Pro/Leader agents are ever shown it). Unknown codes and IDs not
// on the roster aren't counted. HEAD isn't a scan. A failed count is logged.
export const dynamic = "force-dynamic"

function forward(url: string) {
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } })
}

async function handle(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const landing = await qrLanding(code).catch((err) => {
    console.error(`[nop-qr] lookup failed for ${code}; forwarding to the program page:`, err)
    return null
  })
  if (!landing) return forward(programEnrollmentUrl(await getEnrollDomain().catch(() => DEFAULT_ENROLL_DOMAIN)))
  const counted = landing.state === "lead_page" || landing.onRoster
  if (counted && request.method === "GET") {
    await countAgentScan(landing.agentId!).catch((err) => console.error(`[nop-qr] scan count failed for ${landing.agentId}:`, err))
  }
  if (landing.state === "lead_page") return forward(new URL(`/a/${encodeURIComponent(code)}/contact`, request.url).toString())
  return forward(landing.target)
}

export const GET = handle
export const HEAD = handle
