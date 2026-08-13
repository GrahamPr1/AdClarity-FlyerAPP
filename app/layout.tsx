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

export const metadata: Metadata = {
  title: 'OneFlyer — AI-Designed Flyers for Local Businesses',
  description:
    'OneFlyer generates brand-matched, print-ready flyers for your business in minutes. Start with a free trial — no credit card required — then upgrade as you grow.',
  keywords: [
    'flyer generator',
    'AI design',
    'brand-matched flyers',
    'local business marketing',
    'print-ready flyers',
    'OneFlyer',
  ],
  authors: [{ name: 'OneFlyer' }],
  openGraph: {
    title: 'OneFlyer — AI-Designed Flyers for Local Businesses',
    description:
      'Generate brand-matched, print-ready flyers for your business in minutes — start with a free trial, no credit card required.',
    type: 'website',
    url: 'https://oneflyer.co',
    siteName: 'OneFlyer',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OneFlyer — AI-Designed Flyers for Local Businesses',
    description:
      'Generate brand-matched, print-ready flyers for your business in minutes — start with a free trial, no credit card required.',
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
