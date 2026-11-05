import { NextResponse, type NextRequest } from "next/server"
import { getRosterRecord } from "@/lib/enterprise/agents-store"
import { AGENT_ID_RE, nopQrTarget, programEnrollmentUrl } from "@/lib/enterprise/nop-roster"
import { countAgentScan } from "@/lib/enterprise/portal/agent-data"

// GET /a/{agentId} — what a NOP agent's flyer QR encodes. Forwards at once to
// the agent's enrollment URL when their roster record is active, otherwise to
// the program's enrollment page (nopQrTarget).
//
// 302 and no-store, never a permanent redirect: the destination follows the
// agent's roster status at the moment of the scan, so a phone or proxy must
// not remember it. A failed roster lookup forwards to the program's page: the
// visitor still reaches enrollment, and no agent is credited on a guess.
//
// Each GET is one scan for that Agent ID, whatever the agent's tier or status
// (only active Pro/Leader agents are ever shown it). IDs that aren't on the
// roster aren't counted, so made-up URLs can't create keys. HEAD isn't a scan.
// A failed count is logged and never delays the visitor more than the write.
export const dynamic = "force-dynamic"

function forward(url: string) {
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } })
}

async function handle(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  if (!AGENT_ID_RE.test(agentId)) return forward(programEnrollmentUrl())
  const roster = await getRosterRecord(agentId).catch((err) => {
    console.error(`[nop-qr] roster lookup failed for ${agentId}; forwarding to the program page:`, err)
    return undefined
  })
  if (roster === undefined) return forward(programEnrollmentUrl())
  if (roster && request.method === "GET") {
    await countAgentScan(agentId).catch((err) => console.error(`[nop-qr] scan count failed for ${agentId}:`, err))
  }
  return forward(nopQrTarget(agentId, roster))
}

export const GET = handle
export const HEAD = handle
