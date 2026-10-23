# Moving the site URL to oneflyer.org

Printed QR codes point at `ad-clarity-landing-page.vercel.app/r/<code>` and
can never be reprinted. That host stays attached to the project, public, and
serving `/r/`, `/api/`, `/_next/` and `/_vercel/` **forever**. Only its pages
redirect (308) to oneflyer.org. Rules: `legacy-redirects.mjs`; pinned by
`tests/legacy-redirects.test.ts`.

## Before merging

1. Create the canary QR record in production (one time; it never overwrites):

   ```
   APP_ENV=production UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=<write token> \
     npx tsx scripts/create-qr-canary.ts            # dry run
   … --apply                                       # create
   ```

   Then check that `https://ad-clarity-landing-page.vercel.app/r/health-canary`
   shows "OneFlyer QR health check".

## Merge day

1. In Vercel → Settings → Environment Variables, set **Production**
   `NEXT_PUBLIC_SITE_URL` to `https://oneflyer.org`. Leave Preview as it is.
   The value is baked in at build time, so set it **before** the merge deploys.
2. Merge to `main` and wait for the production deploy.
3. Run the post-deploy check from a network that doesn't filter `*.vercel.app`:

   ```
   node scripts/check-legacy-domain.mjs
   ```

   All checks must pass. If the `/r/` checks fail, roll back first and
   investigate afterwards (`docs/launch/rollback.md`).
4. Generate one flyer and confirm that its QR code points at
   `https://oneflyer.org/r/…`.
5. In Search Console, resubmit `https://oneflyer.org/sitemap.xml`.

## Standing check

`.github/workflows/qr-canary.yml` runs `check-legacy-domain.mjs --canary`
hourly from GitHub, outside Vercel. A failed run means printed QR codes may
be broken: GitHub emails about failed scheduled runs.

## Expected side effects

- Everyone signs in once more, because sessions are per-domain.
- Old Stripe return links and already-emailed reset links redirect, and keep
  working: the token travels in the query string.
- Stored `/api/onboarding/material/` links on the old host still resolve
  there, but need a session on that host. Use `toCurrentSiteUrl()`
  (`lib/site-url.ts`) wherever such a link is shown to a user.
