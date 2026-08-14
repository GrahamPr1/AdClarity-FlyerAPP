import { getTrackingRecord, incrementTrackingScan } from "@/lib/store"
import { RedeemButton } from "@/components/redeem-button"

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
  // refresh, same as any real page-view counter.
  await incrementTrackingScan(code)

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-card p-7 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{record.businessName}</p>
        {record.headline && <h1 className="mt-2 text-2xl font-semibold tracking-tight">{record.headline}</h1>}
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

        {record.disclaimer && <p className="mt-6 text-xs text-muted-foreground/70 leading-snug">{record.disclaimer}</p>}
      </div>
    </div>
  )
}
