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
  title: 'OneFlyer — AI-Designed Flyers for Local Businesses',
  description:
    'OneFlyer generates brand-matched, print-ready flyers for your business in minutes. Free: 20 flyers included, no credit card required. Pro: unlimited flyers with priority generation.',
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
      'Generate brand-matched, print-ready flyers for your business in minutes — 20 free, no credit card required.',
    type: 'website',
    url: 'https://oneflyer.co',
    siteName: 'OneFlyer',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OneFlyer — AI-Designed Flyers for Local Businesses',
    description:
      'Generate brand-matched, print-ready flyers for your business in minutes — 20 free, no credit card required.',
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
