import React from "react"
import type { Metadata } from 'next'
import { Inter, Baloo_2 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
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
  'OneFlyer turns one promotion into a professional flyer, Instagram post, text-blast message, Nextdoor post, and trackable QR code — matched to your business and ready in minutes. 3 campaigns free, no credit card.'

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
    <html lang="en" className={`${inter.variable} ${baloo.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
