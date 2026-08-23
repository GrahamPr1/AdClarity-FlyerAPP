import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { listEveryKnownEmail, getClient, getClientPasswordHash, readRedisEnvironmentMarker } from "@/lib/store"
import { auditClients, type AuditableClient } from "@/lib/audit-test-data"
import { getAppEnvironment } from "@/lib/env"

// GET /api/admin/audit
//
// Read-only. Looks for test / preview data sitting in whichever database this
// deployment is connected to.
//
// Exists because preview deployments shared the production Redis instance for
// the project's first ~11 days, and the guardrail only warned rather than
// refusing (fixed — see verdictForMarker in lib/env.ts). Anything created
// against a preview URL in that window landed in live customer data, and
// production credentials are stored as Vercel "sensitive" variables that
// cannot be read back out, so the only way to inspect that database is from
// inside a deployment that already holds them. Hence an endpoint rather than
// a script.
//
// This endpoint NEVER writes and never deletes. It classifies and reports;
// deciding what to do about a flagged record is a human's call.
export async function GET(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const emails = await listEveryKnownEmail()

  const clients: AuditableClient[] = await Promise.all(
    emails.map(async (email) => {
      // getClient, not getOrCreateClient — an audit must not bring records
      // into existence as a side effect of looking at them.
      const [record, passwordHash] = await Promise.all([getClient(email), getClientPasswordHash(email)])
      return {
        email,
        businessName: record?.businessName ?? null,
        createdAt: record?.createdAt ?? null,
        plan: record?.plan ?? "none",
        flyersCreated: record?.flyersCreated ?? 0,
        lifetimeFlyersCreated: record?.lifetimeFlyersCreated ?? 0,
        hasPassword: passwordHash !== null,
      }
    }),
  )

  const report = auditClients(clients)

  return NextResponse.json(
    {
      environment: getAppEnvironment(),
      databaseMarker: await readRedisEnvironmentMarker(),
      generatedAt: new Date().toISOString(),
      ...report,
    },
    // A point-in-time audit must never be served from a cache.
    { headers: { "Cache-Control": "no-store" } },
  )
}
