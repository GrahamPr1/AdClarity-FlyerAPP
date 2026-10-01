import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import {
  getDeliverablesForEmail,
  getExportRecord,
  getGenerationStage,
  getTrackingStats,
  listProducts,
} from "@/lib/store"
import { resolveBusinessProfile } from "@/lib/business-profile-resolve"
import { profileReadyForFlyer } from "@/lib/business-profile"
import { deriveJourney, type JourneyFacts } from "@/lib/journey"

/**
 * Where this client actually is, end to end.
 *
 * One request rather than four. CreateFlyerFlow previously fetched
 * /api/profile, /api/deliverables and /api/brand-profile separately on
 * mount and decided what to show from whichever arrived — three round
 * trips to answer one question, and a render that could briefly disagree
 * with itself while they were in flight.
 *
 * Every field handed to deriveJourney is read from storage here. Nothing
 * is inferred from how long the client has been on the page, and nothing
 * advances because they clicked something — see lib/journey.ts.
 */
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await getSessionIdentity({ cookies: req.cookies })
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // The admin is the site owner, not a client with a journey of their own.
  if (session.sub === ADMIN_SUB) {
    return NextResponse.json({ steps: [], isAdmin: true }, { headers: { "Cache-Control": "no-store" } })
  }

  const email = session.sub
  const [profile, products, deliverables, exportRecord, generationStage] = await Promise.all([
    resolveBusinessProfile(email).catch(() => null),
    listProducts(email).catch(() => []),
    getDeliverablesForEmail(email).catch(() => null),
    getExportRecord(email).catch(() => null),
    getGenerationStage(email).catch(() => null),
  ])

  const flyers = deliverables?.flyers ?? []

  // Scan counts cost two reads per tracking code, and this endpoint is
  // polled while a campaign generates. They are only READ when the export
  // step is already done, which is the only state that displays them, and
  // capped so an account with many flyers cannot turn one poll into dozens
  // of reads. A capped total is honest here — it is a floor on real scans,
  // shown only once there is something to have scanned.
  const SCAN_CODE_LIMIT = 12
  const codes = flyers.map((f) => f.trackingCode).filter((c): c is string => !!c).slice(0, SCAN_CODE_LIMIT)
  // Whether a code EXISTS is free to know; only reading its counters costs.
  const qrScans = exportRecord && codes.length > 0
    ? (await Promise.all(codes.map((c) => getTrackingStats(c).catch(() => ({ scans: 0, clicks: 0 })))))
        .reduce((n, s) => n + s.scans, 0)
    : 0

  const facts: JourneyFacts = {
    hasProfile: !!profile,
    profileComplete: profile ? profileReadyForFlyer(profile) : false,
    scannedPages: profile?.scannedPages?.length ?? 0,
    // A profile that exists with no pages behind it was filled in by hand.
    // That is a skipped scan, not an outstanding one — see deriveJourney.
    scanDeclined: !!profile && (profile.scannedPages?.length ?? 0) === 0,
    productCount: products.length,
    readyFlyerCount: flyers.filter((f) => f.status === "Ready").length,
    generatingFlyerCount: flyers.filter((f) => f.status === "In Progress" || f.status === "Pending").length,
    generationStage,
    hasExported: !!exportRecord,
    // Real scans recorded against this client's flyers, never an estimate.
    qrScans,
    hasTrackingCodes: codes.length > 0,
  }

  return NextResponse.json(
    { steps: deriveJourney(facts), facts, isAdmin: false },
    { headers: { "Cache-Control": "no-store" } },
  )
}
