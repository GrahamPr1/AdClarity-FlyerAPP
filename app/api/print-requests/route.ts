import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { getDeliverablesForEmail, seedPrintRequest } from "@/lib/store"

const MAX_QUANTITY = 500

// GET /api/print-requests — a client's own past print requests.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const deliverables = await getDeliverablesForEmail(session.sub)
  return NextResponse.json({ requests: deliverables.printRequests })
}

// POST /api/print-requests — client requests printed copies of one of
// their own Ready flyers. NOT a real order — no print API call, no charge.
// Just queues a request for the admin to fulfill/invoice manually (see the
// note on PrintRequest in lib/types.ts). Available to every plan.
export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const email = session.sub

  let body: { flyerId?: string; quantity?: number; shippingName?: string; shippingAddress?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const flyerId = body.flyerId?.trim()
  const shippingName = body.shippingName?.trim()
  const shippingAddress = body.shippingAddress?.trim()
  const quantity = body.quantity

  if (!flyerId) return NextResponse.json({ error: "Missing required field: flyerId" }, { status: 422 })
  if (!shippingName) return NextResponse.json({ error: "Missing required field: shippingName" }, { status: 422 })
  if (!shippingAddress) return NextResponse.json({ error: "Missing required field: shippingAddress" }, { status: 422 })
  if (!Number.isInteger(quantity) || quantity! < 1 || quantity! > MAX_QUANTITY) {
    return NextResponse.json({ error: `quantity must be a whole number between 1 and ${MAX_QUANTITY}` }, { status: 422 })
  }

  const deliverables = await getDeliverablesForEmail(email)
  const flyer = deliverables.flyers.find((f) => f.id === flyerId)
  if (!flyer) {
    return NextResponse.json({ error: "Flyer not found" }, { status: 404 })
  }
  if (flyer.status !== "Ready") {
    return NextResponse.json({ error: "This flyer isn't ready yet" }, { status: 422 })
  }

  await seedPrintRequest(email, {
    id: crypto.randomUUID(),
    flyerId,
    flyerTitle: flyer.title,
    quantity: quantity!,
    shippingName,
    shippingAddress,
    notes: body.notes?.trim() || null,
    status: "Requested",
    createdAt: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
