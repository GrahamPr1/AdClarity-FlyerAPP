import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { getClientPasswordHash } from "@/lib/store"
import { AGENT_ID_RE, normalizeEmail } from "@/lib/enterprise/nop-roster"
import { adminReassignAgentId, adminUnlockAgentId } from "@/lib/enterprise/agents-store"

// POST /api/admin/enterprise/nop/agent-id/{id}
//   { action: "unlock",   expectedOwner }
//   { action: "reassign", expectedOwner, to }
//
// expectedOwner is the account the admin saw holding the ID. Both actions are
// a single compare-and-set on it (see agents-store.ts), so if anything has
// changed since the page loaded the action is refused rather than applied to
// a lock the admin never saw.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  if (!AGENT_ID_RE.test(id)) return NextResponse.json({ error: "Invalid Agent ID" }, { status: 422 })

  let body: { action?: string; expectedOwner?: string; to?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const expectedOwner = normalizeEmail(body.expectedOwner ?? "")
  if (!expectedOwner) return NextResponse.json({ error: "Missing expectedOwner" }, { status: 422 })

  const stale = { error: "stale", message: "This Agent ID changed since the page loaded. Refresh and try again." }

  if (body.action === "unlock") {
    const out = await adminUnlockAgentId(id, expectedOwner)
    if (!out.ok) return NextResponse.json(stale, { status: 409 })
    console.log(`[nop] admin ${session!.sub} unlocked agent ${id} from ${expectedOwner}`)
    return NextResponse.json({ ok: true })
  }

  if (body.action === "reassign") {
    const to = normalizeEmail(body.to ?? "")
    if (!to) return NextResponse.json({ error: "Enter the account to reassign to." }, { status: 422 })
    if (to === expectedOwner) return NextResponse.json({ error: "That account already holds this Agent ID." }, { status: 422 })
    // Only to an account that exists: a typo here would otherwise lock the
    // ID to an address nobody can sign in as.
    if (!(await getClientPasswordHash(to))) {
      return NextResponse.json({ error: "No OneFlyer account exists for that email." }, { status: 404 })
    }
    const out = await adminReassignAgentId(id, expectedOwner, to)
    if (!out.ok) {
      if (out.reason === "target_has_id") return NextResponse.json({ error: "That account already holds a different Agent ID." }, { status: 409 })
      if (out.reason === "no_roster_record") return NextResponse.json({ error: "This Agent ID is not on the roster." }, { status: 404 })
      return NextResponse.json(stale, { status: 409 })
    }
    console.log(`[nop] admin ${session!.sub} reassigned agent ${id} from ${expectedOwner} to ${to}`)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "action must be unlock or reassign" }, { status: 422 })
}
