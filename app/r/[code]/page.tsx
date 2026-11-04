import { cache } from "react"
import type { Metadata } from "next"
import { getTrackingRecord, incrementTrackingScan } from "@/lib/store"
import { offerPageFeaturesEnabledFor } from "@/lib/offer-page-access"
import { LeadForm } from "@/components/lead-form"
import { OfferPageCard } from "@/components/offer-page-card"
import { isOfferExpired } from "@/lib/offer-page-content"

// /r/[code] — the page a flyer's QR code actually points to. Public, no
// auth: this is meant to be opened by anyone who scans a printed flyer or
// taps an Instagram post. Self-hosted rather than linking to the client's
// own site (not every client has one, and this is the only way to actually
// count a scan) — see the note on TrackingRecord in lib/types.ts.

// One read per request, shared by the metadata and the page.
const loadRecord = cache(getTrackingRecord)

// A business's page for its own customers, not a OneFlyer marketing page: kept
// out of search results, and titled for the business and its offer.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const record = await loadRecord(code).catch(() => null)
  const title = !record ? "Offer not found" : record.headline ? `${record.businessName} – ${record.headline}` : record.businessName
  return { title: { absolute: title }, robots: { index: false, follow: false } }
}

export default async function RedeemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const record = await loadRecord(code)

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-muted-foreground">This link isn&apos;t valid.</p>
      </div>
    )
  }

  // Counted once per page load — the closest honest proxy for "a QR scan"
  // available without a native app. Fires every render, including a
  // refresh, same as any real page-view counter. A failed count is logged,
  // never a reason not to show the offer.
  await incrementTrackingScan(code).catch((err) => console.error(`[r] scan count failed for ${code}:`, err))

  // The lead form follows the OWNER's plan right now, so upgrading switches it
  // on for flyers already printed. Whatever the plan, and even if the lookup
  // fails, the offer itself always renders: a printed QR code never stops
  // working because of a downgrade, a pause or a cancelled subscription.
  const showLeadForm = await offerPageFeaturesEnabledFor(record.email).catch((err) => {
    console.error(`[r] owner lookup failed for ${code}; showing the offer without the form:`, err)
    return false
  })

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <OfferPageCard
        code={code}
        businessName={record.businessName}
        headline={record.headline}
        offer={record.offer}
        price={record.price}
        expiresAt={record.expiresAt}
        cta={record.cta}
        phone={record.phone}
        website={record.website}
        disclaimer={record.disclaimer}
        form={showLeadForm ? <LeadForm code={code} businessName={record.businessName} offerEnded={isOfferExpired(record.expiresAt)} /> : undefined}
      />
    </div>
  )
}
