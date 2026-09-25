import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { listProducts, upsertProduct, deleteProduct } from "@/lib/store"
import { resolveBusinessProfile } from "@/lib/business-profile-resolve"
import { emptyProduct, MAX_PRODUCTS, type ProductProfile } from "@/lib/product-profile"
import { runProductAgent, businessContextFor } from "@/lib/agent-pipeline/agents/productAgent"

/**
 * Products / services / offers.
 *
 * POST accepts either raw text to be structured by the Product Agent
 * (`understand: true`) or already-structured fields. The AI path is opt-in
 * rather than automatic so an edit — where the client has just corrected the
 * AI — is never re-interpreted and re-overwritten by the same model that got
 * it wrong.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_UNDERSTAND = 20
const WINDOW_SECONDS = 3600

async function requireClient(req: NextRequest) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (session.sub === ADMIN_SUB) {
    return { error: NextResponse.json({ error: "Not available for the admin account" }, { status: 403 }) }
  }
  return { email: session.sub }
}

const str = (v: unknown, max = 600): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}
const strArr = (v: unknown, maxItems = 20, maxLen = 300): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, maxLen)).slice(0, maxItems)
    : []

export async function GET(req: NextRequest) {
  const auth = await requireClient(req)
  if ("error" in auth) return auth.error
  return NextResponse.json({ products: await listProducts(auth.email) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: NextRequest) {
  const auth = await requireClient(req)
  if ("error" in auth) return auth.error
  const email = auth.email

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const id = str(body.id, 64) ?? randomUUID()
  const providedName = str(body.name, 200)
  const rawInput = str(body.rawInput, 8000)

  if (!providedName && !rawInput) {
    return NextResponse.json({ error: "Give the product a name, or describe it." }, { status: 400 })
  }

  const existing = (await listProducts(email)).find((p) => p.id === id) ?? null
  if (!existing && (await listProducts(email)).length >= MAX_PRODUCTS) {
    return NextResponse.json({ error: `You can save up to ${MAX_PRODUCTS} products or services.` }, { status: 400 })
  }

  let product: ProductProfile = existing
    ? { ...existing, name: providedName ?? existing.name }
    : emptyProduct(id, providedName ?? "Untitled")

  if (body.understand === true && rawInput) {
    // One Claude call. Rate-limited per account because it is the only
    // user-triggerable model call on this route.
    const { allowed, retryAfterSeconds } = await checkRateLimit(`product-understand:${email}`, MAX_UNDERSTAND, WINDOW_SECONDS)
    if (!allowed) {
      return NextResponse.json(
        { error: "You've structured a lot of products recently — please wait a few minutes." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      )
    }

    const business = await resolveBusinessProfile(email)
    try {
      const x = await runProductAgent(
        { rawInput, providedName: providedName ?? "", business: businessContextFor(business) },
        email,
      )
      product = {
        ...product,
        name: providedName ?? (x.name.trim() || product.name),
        description: x.description.trim() || null,
        offer: x.offer.trim() || null,
        features: x.features,
        benefits: x.benefits,
        pricing: x.pricing.trim() || null,
        targetCustomer: x.targetCustomer.trim() || null,
        claims: x.claims,
        limitations: x.limitations,
        ctaOpportunities: x.ctaOpportunities,
        rawInput,
        normalizationNotes: x.normalizationNotes,
      }
    } catch (err) {
      console.error("[products] understanding failed:", err instanceof Error ? err.message : err)
      // Save what the client typed rather than losing it. They can retry the
      // structuring, or fill the fields in by hand — never a dead end.
      product = { ...product, rawInput, description: product.description ?? rawInput }
      const saved = await upsertProduct(email, { ...product, updatedAt: new Date().toISOString() })
      return NextResponse.json(
        {
          products: saved,
          product,
          warning: "We saved what you wrote, but couldn't structure it automatically. You can edit the details by hand.",
        },
        { status: 200 },
      )
    }
  } else {
    // Direct field write — a hand edit, which must never be re-inferred.
    product = {
      ...product,
      description: "description" in body ? str(body.description, 2000) : product.description,
      offer: "offer" in body ? str(body.offer, 400) : product.offer,
      pricing: "pricing" in body ? str(body.pricing, 200) : product.pricing,
      targetCustomer: "targetCustomer" in body ? str(body.targetCustomer, 400) : product.targetCustomer,
      features: "features" in body ? strArr(body.features) : product.features,
      benefits: "benefits" in body ? strArr(body.benefits) : product.benefits,
      claims: "claims" in body ? strArr(body.claims) : product.claims,
      limitations: "limitations" in body ? strArr(body.limitations) : product.limitations,
      ctaOpportunities: "ctaOpportunities" in body ? strArr(body.ctaOpportunities, 8) : product.ctaOpportunities,
      imageUrls: "imageUrls" in body ? strArr(body.imageUrls, 10, 2000) : product.imageUrls,
      rawInput: rawInput ?? product.rawInput,
    }
  }

  try {
    const products = await upsertProduct(email, { ...product, updatedAt: new Date().toISOString() })
    return NextResponse.json({ products, product }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save." }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireClient(req)
  if ("error" in auth) return auth.error
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
  const removed = await deleteProduct(auth.email, id)
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ products: await listProducts(auth.email) }, { headers: { "Cache-Control": "no-store" } })
}
