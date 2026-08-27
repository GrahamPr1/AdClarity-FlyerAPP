import React from "react"
import type { Metadata } from 'next'
import { Inter, Baloo_2 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { GoogleAnalytics } from '@/components/google-analytics'
import './globals.css'

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
})

// Warm, rounded display font for headings only — see globals.css's
// h1/h2/h3 rule. Body copy stays on Inter for readability.
const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-baloo",
})

// The real production domain. This was previously "oneflyer.co", which the
// project doesn't own (it's oneflyer.ORG — see `vercel domains ls`), so every
// Open Graph share pointed at somebody else's domain.
const SITE_URL = 'https://oneflyer.org'

const TITLE = 'OneFlyer — Turn One Promotion Into a Full Marketing Campaign'
const DESCRIPTION =
  'Create professional flyers, Instagram posts, text-blast copy, Nextdoor posts, and trackable QR campaigns in minutes. One promotion becomes a full campaign, matched to your business. 3 campaigns free, no credit card.'

export const metadata: Metadata = {
  // Lets relative OG/Twitter image paths and canonical URLs resolve instead
  // of silently falling back to localhost in previews.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s — OneFlyer',
  },
  description: DESCRIPTION,
  keywords: [
    'flyer maker for small business',
    'business flyer maker',
    'marketing flyer generator',
    'AI flyer generator',
    'small business marketing tools',
    'local business marketing',
    'promotional flyer maker',
    'contractor marketing',
    'OneFlyer',
  ],
  authors: [{ name: 'OneFlyer' }],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    url: SITE_URL,
    siteName: 'OneFlyer',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport = {
  themeColor: '#12141a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning is required, not incidental: the pre-paint
    // script in app/page.tsx sets data-intro-seen on <html> before React
    // hydrates (that's the whole point — it has to beat first paint to avoid
    // flashing the brand veil at a returning visitor), so the client tree
    // legitimately has an attribute the server HTML didn't. This only
    // suppresses the warning for <html>'s own attributes, one level deep —
    // the same pattern next-themes uses for exactly this reason.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${baloo.variable}`}>
      {/* GA4. Renders nothing unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set, so
          local and preview traffic can't contaminate production's numbers.
          In <head> via next/script so the consent defaults land before the
          first pageview — see components/google-analytics.tsx. */}
      <GoogleAnalytics />
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
