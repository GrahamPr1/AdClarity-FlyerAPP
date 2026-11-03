import type { ReactNode } from "react"
import { RedeemButton } from "@/components/redeem-button"
import { isOfferExpired } from "@/lib/offer-page-content"

export interface OfferPageCardProps {
  code: string
  businessName: string
  headline: string | null
  offer: string | null
  price?: string | null
  expiresAt?: string | null
  cta: string | null
  phone: string
  website: string | null
  disclaimer: string | null
  /** The lead form, when the owner's plan includes it. Shown on an ended offer too: old flyers keep bringing real leads. */
  form?: ReactNode
  /** The editor's live preview: the call button neither dials nor counts a click. */
  preview?: boolean
  now?: Date
}

/** "2027-05-31" -> "May 31, 2027", in UTC so the date never shifts a day. */
function formatEndDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
}

/**
 * What a flyer's QR code opens. Rendered by /r/<code> and, unchanged, by the
 * offer-page editor's live preview, so the preview is the real page.
 */
export function OfferPageCard(props: OfferPageCardProps) {
  const { code, businessName, headline, offer, price, expiresAt, cta, phone, website, disclaimer, form, preview, now } = props
  const ended = isOfferExpired(expiresAt, now)

  const callButton = (label: string) =>
    preview ? (
      <span className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--brand-teal-bright)] py-3 text-sm font-semibold text-[var(--primary-foreground)]">
        {label}
      </span>
    ) : (
      <RedeemButton code={code} phone={phone} label={label} />
    )

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{businessName}</p>

      {ended ? (
        <>
          <p className="mt-3 text-lg font-medium text-foreground">
            This offer has ended. Contact {businessName} for current pricing.
          </p>
          <div className="mt-6 flex flex-col gap-3">{callButton(`Call ${phone}`)}</div>
          {form}
        </>
      ) : (
        <>
          {headline && <h1 className="mt-2 text-2xl tracking-tight">{headline}</h1>}
          {price && <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--brand-teal-bright)]">{price}</p>}
          {offer && <p className="mt-3 text-[var(--brand-teal-bright)] font-medium">{offer}</p>}
          {expiresAt && <p className="mt-2 text-xs text-muted-foreground">Offer ends {formatEndDate(expiresAt)}</p>}

          <div className="mt-6 flex flex-col gap-3">
            {callButton(cta ?? "Call now")}
            {website && (
              <a href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Visit website
              </a>
            )}
          </div>

          {form}
        </>
      )}

      {disclaimer && <p className="mt-6 text-xs text-muted-foreground/70 leading-snug">{disclaimer}</p>}
    </div>
  )
}
