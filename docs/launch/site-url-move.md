# The old domain and printed QR codes

## Keep `ad-clarity-landing-page.vercel.app` attached — permanently

Printed QR codes on older flyers encode
`https://ad-clarity-landing-page.vercel.app/r/<code>`. A printed code can
never be changed, so that host must keep serving `/r/<code>` for as long as
any of those flyers exist.

- It is attached to the Vercel project `oneflyer` under **Settings → Domains**
  as a **Production** domain with **no redirect**. Do not remove it, rename it
  away, or add a domain-level redirect: Vercel's domain redirect would send
  `/r/` away too, and every older flyer would break.
- New QR codes always encode `https://oneflyer.org/r/<code>`
  (`qrRedeemUrl` in `lib/site-url.ts`), stored on the tracking record, so
  re-rendering a QR reproduces exactly what was printed.

## What the old host does

Its pages redirect (308) to the same path on `https://oneflyer.org`. These
prefixes are **served** on the old host instead, never redirected
(`legacy-redirects.mjs`, pinned by `tests/legacy-redirects.test.ts`):

| Prefix | Why |
|---|---|
| `r/` | QR scan pages. A scan here is served and counted exactly as on oneflyer.org. |
| `api/` | The scan page's click counter (a relative POST a browser won't follow across a 308), photo and logo URLs stored in existing flyers, stored material links, webhooks, one-click unsubscribe. |
| `_next/` | The scan page's scripts, styles and fonts. |
| `_vercel/` | Analytics endpoints the scan page reports to. |

## Standing check

`.github/workflows/qr-canary.yml` scans one real code on **both** hosts from
GitHub, outside Vercel, and fails loudly if either stops showing that code's
business name. It uses the repository variables `QR_CHECK_CODE` and
`QR_CHECK_TEXT`. GitHub throttles scheduled runs, so expect a run every few
hours rather than strictly hourly. Run it on demand from the Actions tab
(**QR canary → Run workflow**), or locally:

```
node scripts/check-legacy-domain.mjs            # full check, both rules
node scripts/check-legacy-domain.mjs --canary   # just what printed QR codes need
```

## Not done (yet)

Production's `NEXT_PUBLIC_SITE_URL` still names the old host, so links the app
builds with `getSiteUrl()` (password-reset and some email links, uploaded
photo URLs) still point at `ad-clarity-landing-page.vercel.app`. They keep
working: pages redirect to oneflyer.org and `/api/` is served. Switching it to
`https://oneflyer.org` is a separate change; the unmerged branch
`site-url-move` (commit `ae2d500`) has the preparation it would need.

## Expected side effects of the page redirect

- Someone signed in on the old host signs in once more on oneflyer.org:
  sessions are per-domain.
- Old Stripe return links and already-emailed reset links redirect and keep
  working: their tokens travel in the query string.
