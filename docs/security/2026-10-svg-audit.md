# SVG / image-processing audit — October 2026 Next.js/React security release

Scope: every place SVG (or HTML that can carry inline SVG) is generated,
accepted, processed or rendered, with the release's risk areas called out:
`next/image` with SVG, `images.dangerouslyAllowSVG`, `sharp`, and
`next/og` `ImageResponse` fed by user- or AI-generated content.
Audited on branch `security-oct-2026` (next 16.4.1, react 19.2.9, sharp 0.35.5).

## The four flagged APIs

| Area | Finding |
|---|---|
| `images.dangerouslyAllowSVG` | **Not set.** `next.config.mjs` has `images: { unoptimized: true }`. |
| `next/image` | One use: `components/sample-gallery.tsx`, static files from `/public/samples/`, not SVG. With `unoptimized: true` the image optimizer never processes them. |
| `sharp` | **Not imported anywhere** in app code. It's present only as Next's optional dependency, now **0.35.5** (single copy in the lockfile; was 0.34.5). |
| `next/og` / `ImageResponse` | **Not used.** No `opengraph-image`, `twitter-image`, or `icon` route files. |

## Where SVG actually appears

| Place | Source | How it's handled | Risk |
|---|---|---|---|
| Coloring pages (`app/api/coloring-page`, `lib/agent-pipeline/agents/coloringAgent.ts`) | **AI-generated** HTML with inline SVG line art | Stored as a `data:text/html` URL, like flyers. Served by `/api/flyers/[id]/view` with `Content-Security-Policy: sandbox allow-same-origin allow-modals` (no `allow-scripts`) + `nosniff`. Dashboard previews it in `<iframe sandbox="">`. | Low in the browser: scripts in it never run. **See finding 2** for the PDF path. |
| Flyers, all 5 formats | **AI-generated** HTML (may include inline SVG) | Same as coloring pages. | Same. |
| Website logo scan (`lib/agent-pipeline/brand-extract.ts`) | Client's **website**; SVG logos preferred | Only the URL is kept, normalised with `new URL()` (which percent-encodes quotes). Rendered as `<img src>`, where SVG can't run script. Never fetched or re-served from our origin. | Low. |
| Website text scrape (`lib/agent-pipeline/scraper.ts`) | Client's website | `<svg>` elements are stripped before text extraction. | None. |
| Uploads (`upload-photo`, `business-profile`) | User | Allow-list is JPEG/PNG/WebP/GIF (+ PDF for the profile). **SVG is rejected.** | None. |
| Favicon `public/icon.svg`, UI icons (`asset-previews.tsx`, pricing, etc.) | Static, ours | Static files / JSX. | None. |
| `dangerouslySetInnerHTML` | — | Only static strings and JSON-LD (theme/intro scripts, analytics, chart CSS). Nothing user- or AI-generated. | None. |

## Findings to fix (not changed in this patch — scoped out: no UI/generation changes)

1. **Admin enterprise demo renders AI HTML unsandboxed — fix soon.**
   `app/admin/enterprise-demo/demo-client.tsx` shows a generated flyer with
   `<iframe srcDoc={flyer.html}>` and **no `sandbox` attribute**. That HTML
   (AI output, which can include inline SVG with event handlers or `<script>`)
   runs as oneflyer.org inside an **admin** session, so it could call admin
   APIs (e.g. `set-plan`, `set-admin`) with the admin's cookies.
   **Fix:** add `sandbox=""`, matching the dashboard preview. One attribute,
   no visual change.

2. **Server-side PDF render runs AI HTML with JavaScript on and open network.**
   `lib/pdf/flyer-pdf.ts` loads generated HTML into headless Chromium
   (`page.setContent`) with default options: scripts enabled and no request
   filtering. The browser-side sandbox doesn't apply here. Generated HTML (or a
   value injected into it, see 3) could run script during the render and make
   requests from the server.
   **Fix:** `browser.newContext({ javaScriptEnabled: false })`, plus a
   `page.route` allow-list (Blob storage, Unsplash/Higgsfield image hosts, the
   QR data URLs). Test that PDFs still render fonts and photos.

3. **Uploaded/submitted `logoUrl` is inserted into HTML without escaping.**
   `injectLogo` in `lib/agent-pipeline/flyer-html.ts` builds
   `<img … src="${logoUrl}">`. Scraped logo URLs are safe (normalised), but the
   intake schema accepts `logoUrl` as any string (`z.string()`), so a crafted
   submission could break out of the attribute and add an event handler to
   the submitter's own flyer. That's inert in the sandboxed viewer, but live
   in the PDF render (2) and the admin demo (1).
   **Fix:** escape the attribute (there is already an `escapeHtml` in the same
   file) and validate `logoUrl` as an `http(s)` URL at intake.

## Other results from this patch

- **Server Actions:** none (`"use server"` appears nowhere; the
  `useFormState` hit is react-hook-form's).
- **`"use cache"` / `cacheLife` / `cacheTag` / `unstable_cache`:** none, and no
  experimental caching flags in `next.config.mjs`.
- **Deployment exposure:** Vercel Authentication was **off** for the project, so
  every preview and old production deployment was publicly reachable on its
  `*.vercel.app` URL running older, unpatched Next.js. Addressed by enabling
  Standard Protection (production domain stays public; old production
  deployments are kept as rollback targets).
