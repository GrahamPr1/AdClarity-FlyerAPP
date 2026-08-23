import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity } from "@/lib/auth"
import { isAdminSession } from "@/lib/admin"
import { listEveryKnownEmail, getClient, getClientPasswordHash, readRedisEnvironmentMarker, collectAccountKeys, deleteAccountCompletely } from "@/lib/store"
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

// DELETE /api/admin/audit
//
// Permanently removes accounts the audit has flagged. Irreversible.
//
// The safety property that matters: this endpoint does NOT trust the list it
// is given. It re-runs the audit server-side and refuses any address the
// heuristics currently rate "looks-real", so a stale page, a mistyped
// address, or a hand-crafted request cannot delete a paying customer. The
// client chooses only which of the *already-flagged* rows to remove.
//
// Body: { emails: string[], dryRun?: boolean }
// dryRun returns exactly what would be removed, touching nothing.
export async function DELETE(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!(await isAdminSession(session?.sub))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { emails?: unknown; dryRun?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }

  const requested = Array.isArray(body.emails) ? body.emails.filter((e): e is string => typeof e === "string") : []
  if (requested.length === 0) {
    return NextResponse.json({ error: "Provide at least one email" }, { status: 422 })
  }
  const dryRun = body.dryRun === true

  // Re-derive the audit from live data rather than trusting the caller.
  const emails = await listEveryKnownEmail()
  const clients: AuditableClient[] = await Promise.all(
    emails.map(async (email) => {
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
  const verdictByEmail = new Map(auditClients(clients).flagged.map((f) => [f.email.toLowerCase(), f.verdict]))

  const allowed: string[] = []
  const refused: { email: string; reason: string }[] = []
  for (const email of requested) {
    const key = email.trim().toLowerCase()
    const verdict = verdictByEmail.get(key)
    if (!verdict) {
      refused.push({ email, reason: "not currently flagged by the audit — refusing to delete" })
      continue
    }
    // An admin deleting their own account would lock everyone out of this
    // very tool, so it is never allowed from here.
    if (session?.sub && key === session.sub.toLowerCase()) {
      refused.push({ email, reason: "this is the signed-in admin account" })
      continue
    }
    allowed.push(key)
  }

  const results = await Promise.all(
    allowed.map(async (email) => {
      const { keys, trackingCodes } = await collectAccountKeys(email)
      if (!dryRun && keys.length > 0) await deleteAccountCompletely(email)
      return { email, verdict: verdictByEmail.get(email), keyCount: keys.length, keys, trackingCodes }
    }),
  )

  if (!dryRun && results.length > 0) {
    console.warn(`[admin] Deleted ${results.length} flagged account(s): ${results.map((r) => r.email).join(", ")}`)
  }

  return NextResponse.json({
    dryRun,
    deleted: dryRun ? [] : results.map((r) => r.email),
    wouldDelete: dryRun ? results.map((r) => r.email) : [],
    details: results,
    refused,
  })
}
