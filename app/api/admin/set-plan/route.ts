import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { setClientPlan } from "@/lib/store"
import { recordAdminOverride } from "@/lib/billing"
import type { PlanId } from "@/lib/types"

// POST /api/admin/set-plan
// Admin OVERRIDE of a client's enforcement plan — not billing-driven.
//
// Paid plans normally come only from the Stripe webhook, which treats the
// subscription as the source of truth. That means an override on an account
// WITH a Stripe subscription lasts only until that subscription's next event
// (renewal, plan switch, cancellation), which re-applies what Stripe says.
// To change what a subscriber pays for, change the subscription in Stripe.
//
// Every override is logged: the member's billing record gets planSource
// "admin_override" with who and when, and the admin activity log gets a line.
// That is also what keeps a legitimately overridden account OFF the Free-Pro
// audit (/admin/billing/audit).
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
  if (plan !== "trial" && plan !== "basic" && plan !== "pro") {
    return NextResponse.json({ error: 'plan must be "trial", "basic", or "pro"' }, { status: 422 })
  }

  const client = await setClientPlan(email, plan as PlanId)
  await recordAdminOverride(email, plan as PlanId, session.sub)
  return NextResponse.json({ ok: true, client })
}
