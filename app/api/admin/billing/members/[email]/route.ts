import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { getClient, getWaitlistEntriesForEmail, listBillingEvents, listCampaigns } from "@/lib/store"
import { memberStatus, stripeCustomerUrl } from "@/lib/billing-admin"
import { stripeLiveMode } from "@/lib/billing-admin-data"
import { PLAN_LIMITS } from "@/lib/types"

// GET /api/admin/billing/members/:email — one member's full billing record.
// Invoices are NOT duplicated here; the page links to the customer in Stripe.
export async function GET(request: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = decodeURIComponent((await params).email).trim().toLowerCase()
  const client = await getClient(email)
  if (!client) return NextResponse.json({ error: "No such account" }, { status: 404 })

  const [campaigns, waitlist, events] = await Promise.all([listCampaigns(email), getWaitlistEntriesForEmail(email), listBillingEvents()])
  return NextResponse.json({
    email,
    businessName: client.businessName,
    plan: client.plan,
    status: memberStatus(client.plan, client.billing),
    flyersCreated: client.flyersCreated,
    flyersLimit: PLAN_LIMITS[client.plan],
    periodStart: new Date(client.periodStart).toISOString(),
    periodEnd: new Date(client.periodEnd).toISOString(),
    lifetimeFlyersCreated: client.lifetimeFlyersCreated,
    campaignsCreated: campaigns.length,
    pausedAt: client.pausedAt,
    createdAt: client.createdAt,
    stripeCustomerId: client.stripeCustomerId,
    stripeUrl: client.stripeCustomerId ? stripeCustomerUrl(client.stripeCustomerId, stripeLiveMode()) : null,
    billing: client.billing,
    convertedFromWaitlist: waitlist.length > 0,
    recentEvents: events.filter((e) => e.email === email).slice(0, 25),
  })
}
