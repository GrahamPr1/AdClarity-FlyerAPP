import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { Redis } from "@upstash/redis"
import { head, put } from "@vercel/blob"
import { getAppEnvironment, environmentClass, verdictForMarker } from "@/lib/env"
import { assertRedisMatchesEnvironment, readRedisEnvironmentMarker } from "@/lib/store"
import { assertBlobMatchesEnvironment, readBlobEnvironmentMarker } from "@/lib/blob-env"

// /api/admin/isolation-probe — agent-platform branch infrastructure check.
//
// Proves a deployment writes to its OWN Redis and Blob stores, not
// production's. POST writes a nonce to both (Redis key
// `__isolation_probe:<nonce>`, private blob `__isolation_probe/<nonce>`);
// GET ?nonce=… reports whether that nonce exists in THIS deployment's stores.
// Both report each store's environment marker and the verdictForMarker
// decision (lib/env.ts), the same guardrail lib/store.ts and lib/blob-env.ts
// enforce at boot.
//
// Inert in production (404) and without ISOLATION_PROBE_TOKEN (404), which
// is set only on Preview (agent-platform). Never reads or writes anything but
// the probe key/blob and the existing markers.

const REDIS_PREFIX = "__isolation_probe:"
const BLOB_PREFIX = "__isolation_probe/"
const NONCE = /^[a-z0-9-]{8,64}$/

function authorised(request: NextRequest): boolean {
  if (getAppEnvironment() === "production") return false
  const expected = process.env.ISOLATION_PROBE_TOKEN?.trim()
  const given = request.headers.get("x-isolation-probe-token")?.trim()
  if (!expected || !given) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function report(nonce: string) {
  // Run the boot guardrails first: a non-production deploy pointed at a store
  // marked "production" throws here and never reaches the reads below.
  await assertRedisMatchesEnvironment()
  await assertBlobMatchesEnvironment()

  const environment = getAppEnvironment()
  const redis = Redis.fromEnv()
  const [redisMarker, blobMarker, redisValue, blobHead] = await Promise.all([
    readRedisEnvironmentMarker(),
    readBlobEnvironmentMarker(),
    redis.get<string>(`${REDIS_PREFIX}${nonce}`),
    head(`${BLOB_PREFIX}${nonce}`).catch(() => null),
  ])

  return {
    environment,
    agentPlatformEnabled: process.env.AGENT_PLATFORM_ENABLED === "true",
    nonce,
    redis: {
      marker: redisMarker,
      verdict: verdictForMarker(environment, redisMarker),
      isProductionStore: redisMarker === "production",
      probeKeyPresent: redisValue !== null,
    },
    blob: {
      marker: blobMarker,
      verdict: verdictForMarker(environmentClass(environment), blobMarker),
      isProductionStore: blobMarker === "production",
      probeBlobPresent: blobHead !== null,
    },
  }
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return new NextResponse(null, { status: 404 })
  const nonce = request.nextUrl.searchParams.get("nonce") ?? ""
  if (!NONCE.test(nonce)) return NextResponse.json({ error: "nonce must match [a-z0-9-]{8,64}" }, { status: 400 })

  await assertRedisMatchesEnvironment()
  await assertBlobMatchesEnvironment()
  await Redis.fromEnv().set(`${REDIS_PREFIX}${nonce}`, new Date().toISOString(), { ex: 60 * 60 * 24 * 30 })
  await put(`${BLOB_PREFIX}${nonce}`, Buffer.alloc(0), { access: "private", contentType: "text/plain", addRandomSuffix: false })

  return NextResponse.json(await report(nonce), { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return new NextResponse(null, { status: 404 })
  const nonce = request.nextUrl.searchParams.get("nonce") ?? ""
  if (!NONCE.test(nonce)) return NextResponse.json({ error: "nonce must match [a-z0-9-]{8,64}" }, { status: 400 })
  return NextResponse.json(await report(nonce), { headers: { "Cache-Control": "no-store" } })
}
