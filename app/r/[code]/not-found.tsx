import type { Metadata } from "next"

// /r/<code> for a code that doesn't exist: the friendly page, with a real 404.
// Next draws this in the browser after notFound(): the title, noindex and 404
// are in the response, but the text needs JavaScript. Server-rendering it would
// mean a Redis lookup in middleware on every scan of every printed QR code.
export const metadata: Metadata = { title: { absolute: "Offer not found" }, robots: { index: false, follow: false } }

export default function UnknownOfferCode() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-muted-foreground">This link isn&apos;t valid.</p>
    </div>
  )
}
