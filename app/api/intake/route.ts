import { NextResponse } from "next/server"
import type { IntakeSubmission } from "@/lib/types"
import { saveIntake } from "@/lib/store"

// POST /api/intake
// Accepts the onboarding IntakeSubmission, validates required fields, and
// stores/logs the payload.
export async function POST(request: Request) {
  let body: IntakeSubmission
  try {
    body = (await request.json()) as IntakeSubmission
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Basic validation of required fields.
  const missing: string[] = []
  if (!body.businessName?.trim()) missing.push("businessName")
  if (!body.industry?.trim()) missing.push("industry")
  if (!body.services || body.services.length === 0) missing.push("services")
  if (!body.targetAudience?.trim()) missing.push("targetAudience")

  if (missing.length > 0) {
    return NextResponse.json({ error: "Missing required fields", missing }, { status: 422 })
  }

  const saved = saveIntake(body)

  // -------------------------------------------------------------------------
  // HANDOFF POINT TO THE EXTERNAL AGENT PIPELINE.
  //
  // In production, this is where the validated IntakeSubmission is forwarded
  // to the external Claude-based automation pipeline (built outside of v0),
  // which will:
  //   1) generate the client's flyers/pages and publish the finished files back
  //   2) generate a matching landing page/website and grant the client access
  // The pipeline reports finished work back via the /api/agent-callback webhook.
  //
  // e.g. await fetch(process.env.AGENT_PIPELINE_URL!, {
  //        method: "POST",
  //        headers: { "content-type": "application/json" },
  //        body: JSON.stringify(saved),
  //      })
  // -------------------------------------------------------------------------
  console.log("[v0] Intake received — handoff to agent pipeline:", saved)

  return NextResponse.json({ ok: true, submittedAt: saved.submittedAt }, { status: 201 })
}
