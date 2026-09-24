import Script from "next/script"

/**
 * Google Tag Manager.
 *
 * Runs ALONGSIDE the direct GA4 tag in components/google-analytics.tsx and does
 * not replace it. The two are independent: GA4 configures itself directly via
 * gtag.js, GTM loads its own container and manages whatever tags are defined
 * inside it. Both push onto the same window.dataLayer, which is by design —
 * dataLayer is a plain array and is shared by every Google tag on the page.
 *
 * ROUTED THROUGH next/script ON PURPOSE. The obvious alternative — a raw
 * <script dangerouslySetInnerHTML> placed in the layout — is what broke this
 * site twice: a raw <script> rendered as a child of <html> is invalid HTML, so
 * the parser relocates it into <body>, React's tree and the real DOM then
 * disagree about where the node lives, and hydration throws. next/script
 * injects the tag itself rather than rendering it into the element tree, so
 * there is no server/client structural mismatch to get wrong.
 *
 * afterInteractive is GTM's documented strategy and the correct one here: the
 * container only needs to load after the page is interactive, and unlike the
 * GA4 consent defaults it is not ordering-sensitive against gtag.js. The
 * dataLayer array itself is created by the snippet's first statement, so
 * anything pushed before GTM loads is still picked up when it does.
 *
 * The container ID is overridable via NEXT_PUBLIC_GTM_CONTAINER_ID so a
 * preview or a second property can be pointed elsewhere without a code change.
 */
const DEFAULT_CONTAINER_ID = "GTM-TLBKNZHK"

export function gtmContainerId(): string {
  return process.env.NEXT_PUBLIC_GTM_CONTAINER_ID?.trim() || DEFAULT_CONTAINER_ID
}

/** The <head> half: loads the container. Render inside <body>; next/script
 *  handles the actual injection, so its position in the tree is not the
 *  position it ends up executing from. */
export function GoogleTagManager() {
  const id = gtmContainerId()
  return (
    <Script id="gtm-init" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`}
    </Script>
  )
}

/**
 * The <body> half: the no-JavaScript fallback.
 *
 * A plain <noscript> element, not next/script — next/script is for executable
 * script tags and cannot express this. <noscript> containing an <iframe> is
 * valid as a child of <body>, so unlike a bare <script> it does not get
 * relocated by the parser and cannot cause the hydration mismatch described
 * above. It renders nothing at all for visitors with JavaScript enabled.
 */
export function GoogleTagManagerNoScript() {
  const id = gtmContainerId()
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${id}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  )
}
