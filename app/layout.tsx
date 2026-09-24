import React from "react"
import { ThemeProvider } from "@/components/theme-provider"
import type { Metadata } from 'next'
import { DM_Sans, DM_Serif_Display } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { GoogleAnalytics } from '@/components/google-analytics'
import { GoogleTagManager, GoogleTagManagerNoScript } from '@/components/google-tag-manager'
import './globals.css'

// Body copy. 400/500 only — the editorial layout leans on the serif for
// emphasis rather than on heavy sans weights, so shipping 600/700 as well
// would be two extra woff2 files nothing renders.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
})

// Display serif for headings only — see globals.css's h1/h2/h3 rule.
// Ships a single 400 weight by design; globals.css sets font-weight:400 on
// headings so the browser never tries to synthesise a bold from it.
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap",
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
  themeColor: '#fbfaf7',
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
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">
        {/* GTM's no-JS fallback, first child of <body> per Google's snippet.
            A <noscript> is valid here, so unlike a bare <script> the parser
            leaves it exactly where React put it. */}
        <GoogleTagManagerNoScript />
        {/* Applies the stored theme BEFORE first paint, so a dark-mode user
            never sees a white flash while React hydrates and the account value
            is fetched. Reads only the local mirror; ThemeProvider reconciles it
            with the account afterwards.

            MUST be inside <body>, as the first child. It previously sat as a
            direct child of <html>, which HTML does not permit: the parser
            relocated it into <body>, so React's tree said "script before body"
            while the real DOM said "script inside body". That is a structural
            hydration mismatch, not an attribute one, so the
            suppressHydrationWarning on <html> did nothing for it — that only
            covers <html>'s own attributes, one level deep. The server kept
            returning a clean 200 and React then threw while hydrating on the
            client, which is why the admin pages died with a browser-level
            "This page couldn't load" instead of any server error.

            First child of <body> still beats first paint: it is inline and
            synchronous, so it runs before any body content is painted. */}
        <script
          // Static string, no interpolation — nothing user-controlled reaches it.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('oneflyer:theme')||'light';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light'}catch(e){}})()`,
          }}
        />
        {/* GA4 — MOVED HERE FROM BEING A CHILD OF <html>, which is the other
            half of the hydration bug that took the admin pages down. This
            component renders a raw inline <script> for the Consent Mode
            defaults, and a <script> is not permitted as a child of <html>:
            the parser relocated it into <body>, React's tree disagreed with
            the real DOM, and hydration threw.

            The previous fix moved the theme script but missed this one,
            because GA renders NOTHING unless NEXT_PUBLIC_GA_MEASUREMENT_ID is
            set — it is unset locally and set in production, so the local
            verification came back clean while production stayed broken.
            Reproduced by running the dev server with the variable set: the
            errors returned on every page, /admin included.

            Ordering is preserved. The consent defaults still execute during
            HTML parse, and gtag.js + the config call are both
            strategy="afterInteractive", so they cannot run before it. */}
        <GoogleAnalytics />
        {/* GTM container. Loads alongside GA4, not instead of it. */}
        <GoogleTagManager />
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
