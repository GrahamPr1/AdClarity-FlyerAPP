import { NextRequest, NextResponse } from "next/server"
import { waitUntil } from "@vercel/functions"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getPipelineState } from "@/lib/store"
import { retryFlyer } from "@/lib/agent-pipeline/pipeline"

// Same reasoning as app/api/intake/route.ts's maxDuration — this route also
// keeps the function alive past the response via waitUntil() below.
export const maxDuration = 300

// POST /api/deliverables/retry
// Regenerates one Failed (or stuck) flyer. A client session always retries
// their OWN flyer (their session email, never a client-supplied one — a
// client can't trigger a retry on someone else's data by passing a
// different email). The admin session has no "own" deliverables, so it
// must specify which client's flyer to retry.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { flyerId?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const flyerId = body.flyerId?.trim()
  if (!flyerId) {
    return NextResponse.json({ error: "Missing required field: flyerId" }, { status: 422 })
  }

  let email: string
  if (session.sub === ADMIN_SUB) {
    const adminEmail = body.email?.trim().toLowerCase()
    if (!adminEmail) {
      return NextResponse.json({ error: "Missing required field: email (required for admin retries)" }, { status: 422 })
    }
    email = adminEmail
  } else {
    email = session.sub
  }

  const pipelineState = await getPipelineState(email)
  if (!pipelineState) {
    return NextResponse.json(
      { error: "nothing_to_retry", message: "No saved data to retry from — please submit a new request instead." },
      { status: 422 },
    )
  }

  const flyerRequest = pipelineState.flyerRequests.find((r) => r.id === flyerId)
  if (!flyerRequest) {
    return NextResponse.json({ error: "Flyer not found" }, { status: 404 })
  }

  waitUntil(
    retryFlyer(email, pipelineState.intake, flyerRequest).catch((err) => {
      console.error("[agent-pipeline] Unhandled retry error:", err)
    }),
  )

  return NextResponse.json({ ok: true })
}
