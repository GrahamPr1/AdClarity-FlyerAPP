import Script from "next/script"

/**
 * Google Analytics 4.
 *
 * The Measurement ID comes from NEXT_PUBLIC_GA_MEASUREMENT_ID rather than
 * being hardcoded, so a preview or local run can be pointed at a separate
 * property — or at nothing, which is the default. When it is unset this
 * component renders nothing at all: no script, no cookie, no request to
 * Google. That means development and preview traffic cannot silently
 * contaminate production's numbers, which is the same isolation rule the
 * Redis and Blob work established.
 *
 * CONSENT MODE v2 is initialised BEFORE the config call, which is the only
 * order that works — a default set afterwards is applied too late and the
 * first pageview has already been sent.
 *
 * The defaults are region-scoped: denied for the EEA and UK, granted
 * elsewhere. That is the low-effort groundwork, and it is honest today
 * because it means EEA visitors are measured in Google's cookieless
 * "consent mode" modelling rather than being tracked without having agreed.
 * When a consent banner is added it only has to call
 * `gtag('consent', 'update', { analytics_storage: 'granted' })` on accept —
 * no other change here.
 *
 * Ad-related consent stays denied everywhere and unconditionally: this site
 * runs no advertising, so there is nothing for it to enable.
 */

// EEA + UK. Google matches these against its own geo lookup.
const RESTRICTED_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH",
]

export function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
  if (!id) return null

  return (
    <>
      {/* A raw inline script, not next/script: this must execute during HTML
          parse, before gtag.js loads, or the first pageview is sent under the
          wrong consent state. next/script's beforeInteractive strategy is not
          available in the App Router, and afterInteractive would be too late. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{
  ad_storage:'denied',
  ad_user_data:'denied',
  ad_personalization:'denied',
  analytics_storage:'denied',
  region:${JSON.stringify(RESTRICTED_REGIONS)},
  wait_for_update:500
});
gtag('consent','default',{
  ad_storage:'denied',
  ad_user_data:'denied',
  ad_personalization:'denied',
  analytics_storage:'granted'
});`.trim(),
        }}
      />
      <Script id="ga-lib" strategy="afterInteractive" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} />
      <Script
        id="ga-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`.trim(),
        }}
      />
    </>
  )
}
