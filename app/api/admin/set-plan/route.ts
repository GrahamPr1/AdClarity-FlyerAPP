import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { setClientPlan } from "@/lib/store"
import type { PlanId } from "@/lib/types"

// POST /api/admin/set-plan
// Manually toggles a client's real enforcement plan — not billing-driven.
// Protected by the same signed dashboard session cookie the dashboard login
// uses (see middleware.ts / lib/auth.ts). No UI yet: call with curl, or
// fetch() from the browser console while signed into the dashboard (the
// session cookie goes along automatically).
//
//   fetch("/api/admin/set-plan", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ email: "client@example.com", plan: "pro" }),
//   })
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (session?.sub !== ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { email?: string; plan?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const plan = body.plan

  if (!email) {
    return NextResponse.json({ error: "Missing required field: email" }, { status: 422 })
  }
  if (plan !== "free" && plan !== "pro") {
    return NextResponse.json({ error: 'plan must be "free" or "pro"' }, { status: 422 })
  }

  const client = await setClientPlan(email, plan as PlanId)
  return NextResponse.json({ ok: true, client })
}
