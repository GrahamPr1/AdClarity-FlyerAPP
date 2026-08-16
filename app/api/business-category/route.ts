import { NextRequest, NextResponse } from "next/server"
import { BUSINESS_CATEGORIES } from "@/lib/types"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { setClientBusinessCategory } from "@/lib/store"

// POST /api/business-category
// Lets an existing client set their own business_category from the
// dashboard's one-time, non-blocking banner (see DashboardClient) — the
// only path to setting one for an account that predates this field, since
// onboarding's new required Category step (see components/onboarding-form.tsx)
// only runs once, at signup. Always the client's OWN email — there's no
// "own" category for the admin session to set.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { category?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const category = body.category
  if (!category || !BUSINESS_CATEGORIES.includes(category as (typeof BUSINESS_CATEGORIES)[number])) {
    return NextResponse.json({ error: `category must be one of: ${BUSINESS_CATEGORIES.join(", ")}` }, { status: 422 })
  }

  await setClientBusinessCategory(session.sub, category as (typeof BUSINESS_CATEGORIES)[number])
  return NextResponse.json({ ok: true })
}
