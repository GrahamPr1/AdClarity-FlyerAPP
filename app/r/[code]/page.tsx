import { getClient, getTrackingRecord, incrementTrackingScan } from "@/lib/store"
import { leadCaptureEnabled } from "@/lib/agent-pipeline/plan-features"
import { RedeemButton } from "@/components/redeem-button"
import { LeadForm } from "@/components/lead-form"

// /r/[code] — the page a flyer's QR code actually points to. Public, no
// auth: this is meant to be opened by anyone who scans a printed flyer or
// taps an Instagram post. Self-hosted rather than linking to the client's
// own site (not every client has one, and this is the only way to actually
// count a scan) — see the note on TrackingRecord in lib/types.ts.
export default async function RedeemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const record = await getTrackingRecord(code)

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
  const showLeadForm = await getClient(record.email).then(leadCaptureEnabled, (err) => {
    console.error(`[r] owner lookup failed for ${code}; showing the offer without the form:`, err)
    return false
  })

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{record.businessName}</p>
        {record.headline && <h1 className="mt-2 text-2xl tracking-tight">{record.headline}</h1>}
        {record.offer && <p className="mt-3 text-[var(--brand-teal-bright)] font-medium">{record.offer}</p>}

        <div className="mt-6 flex flex-col gap-3">
          <RedeemButton code={code} phone={record.phone} label={record.cta ?? "Call now"} />
          {record.website && (
            <a href={record.website.startsWith("http") ? record.website : `https://${record.website}`}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Visit website
            </a>
          )}
        </div>

        {showLeadForm && <LeadForm code={code} businessName={record.businessName} />}

        {record.disclaimer && <p className="mt-6 text-xs text-muted-foreground/70 leading-snug">{record.disclaimer}</p>}
      </div>
    </div>
  )
}
