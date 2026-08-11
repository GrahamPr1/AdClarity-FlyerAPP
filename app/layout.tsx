import React from "react"
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: 'AdClarity — Back-End & Organic Marketing Systems',
  description:
    'AdClarity builds the brand, materials, and always-on reputation systems your business owns outright. Basic: $250 build + $50/mo. Plus: $500 build + your chosen ad budget. Come back anytime for updates — up to 20 flyers a month.',
  keywords: [
    'organic marketing',
    'brand build',
    'reputation management',
    'referral systems',
    'local business marketing',
    'marketing subscription',
    'AdClarity',
  ],
  authors: [{ name: 'AdClarity' }],
  openGraph: {
    title: 'AdClarity — Back-End & Organic Marketing Systems',
    description:
      'We build the brand, materials, and always-on reputation systems your business owns outright — no ad spend required to start.',
    type: 'website',
    url: 'https://adclarity.co',
    siteName: 'AdClarity',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AdClarity — Back-End & Organic Marketing Systems',
    description:
      'We build the brand, materials, and always-on reputation systems your business owns outright — no ad spend required to start.',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export const viewport = {
  themeColor: '#0f1826',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
