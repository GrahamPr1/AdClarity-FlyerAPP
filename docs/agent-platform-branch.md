# `agent-platform` branch: the isolated copy site

A long-lived copy of OneFlyer for building the multi-client agent platform.
It is a normal Vercel **Preview** deployment of the `agent-platform` branch
and uses Preview credentials. Production and `main` are untouched.

Freeze list for all agent-platform work: [`NOP_FROZEN.md`](../NOP_FROZEN.md).

## Stable URL

```
https://oneflyer-git-agent-platform-grahampr1s-projects.vercel.app
```

This is Vercel's **branch alias**. Every push to `agent-platform` moves it to
the newest Ready deployment, so the URL never changes. Per-commit URLs
(`oneflyer-<hash>-grahampr1s-projects.vercel.app`) also exist; ignore them.

It sits behind the project's Standard Deployment Protection. In a browser you
sign in with your Vercel account. From a terminal, use
`vercel curl <path> --deployment <url>`.

> If `*.vercel.app` fails with an SSL error naming `blocked.com-default.ws`,
> your network's DNS filter is blocking vercel.app. Allow-list `vercel.app` or
> use the custom subdomain below. From a terminal you can pin the edge IP with
> `curl --resolve <host>:443:216.150.1.1 …`.

## Attaching a custom subdomain (e.g. `staging.oneflyer.org`)

This is not done yet. Doing it **adds** a domain and doesn't touch
`oneflyer.org` or its existing records.

1. Vercel → project **oneflyer** → Settings → **Domains** → *Add Domain* →
   `staging.oneflyer.org`.
2. In the dialog, choose **Connect to an environment → Preview**. Under
   *Git Branch*, enter `agent-platform`. Do **not** pick Production, and do
   not edit the existing `oneflyer.org` / `www` entries.
   CLI equivalent: `vercel domains add staging.oneflyer.org oneflyer`, then set
   the branch in the dashboard (the CLI can't assign a git branch).
3. At the DNS host for `oneflyer.org`, add one record:
   `CNAME  staging  →  cname.vercel-dns.com` (or the exact target the
   dashboard shows). Leave every other record alone.
4. When the domain shows *Valid Configuration*, run
   `vercel env rm NEXT_PUBLIC_SITE_URL preview agent-platform`, then
   `vercel env add NEXT_PUBLIC_SITE_URL preview agent-platform` with
   `https://staging.oneflyer.org`. Push (or redeploy) so it takes effect.
5. Deployment Protection still applies to the custom domain. That's
   intended for a staging copy.

## Environment (Preview, branch `agent-platform` only)

Branch-scoped vars override the general Preview values. None exist in
Production.

| Variable | Value |
|---|---|
| `AGENT_PLATFORM_ENABLED` | `true` (unset in Production and other previews) |
| `NEXT_PUBLIC_SITE_URL` | the branch alias above |
| `STRIPE_SECRET_KEY` | `sk_test_…`, the Stripe **sandbox** ("New business sandbox") |
| `STRIPE_PRICE_{BASIC,PRO}_{MONTHLY,ANNUAL}` | sandbox price IDs |
| `STRIPE_PORTAL_CONFIGURATION_ID` | sandbox portal config |
| `ISOLATION_PROBE_TOKEN` | random, for `/api/admin/isolation-probe` |

Everything else is inherited from Preview (all branches).

> **Warning, found 2026-11-13.** The general Preview `UPSTASH_REDIS_REST_*`
> variables point at the **production** Redis (`upstash-KV-Datbase-Oneflyer`).
> Production's `__oneflyer_environment` label says `preview` because a preview
> deploy claimed it first. Every preview branch without its own branch-scoped
> Redis vars reads and writes live data. `docs/local-development.md` says
> otherwise and is wrong on this point.

- **Redis must be the `oneflyer-agent-platform` database.** Set
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` scoped to
  `Preview (agent-platform)`, with the values of `AP_KV_REST_API_URL` and
  `AP_KV_REST_API_TOKEN`. Without them the branch falls back to production
  Redis.
- **Blob** uses the Development/Preview `BLOB_READ_WRITE_TOKEN`, labelled
  `nonproduction`. The label is first-writer-wins like the Redis one, so it
  isn't proof. Confirm in the Vercel Blob dashboard which store holds
  `__isolation_probe/`.
- `SESSION_SECRET` and `DASHBOARD_PASSWORD` are Preview's own values.
- Anthropic and Resend keys are Preview's.

**Environment labels prove nothing.** `__oneflyer_environment` (Redis) and
`__environment/*` (Blob) are written by whichever environment starts first,
and production only warns on a mismatch. Identify a database by its URL, never
by its label.

### Stripe on this branch

- Only test-mode keys are configured (`sk_test_`). Production's live keys are
  Production-scoped and never reach a preview.
- **`STRIPE_WEBHOOK_SECRET` is not set.** The `whsec_` in `.env.local` belongs
  to a local `stripe listen` session and isn't valid for a deployed endpoint.
  Until it's set, Checkout and the portal work, but `/api/stripe/webhook`
  answers 500, so plan changes after payment aren't recorded on the copy site.
  To enable webhooks:
  1. Stripe sandbox → Developers → Webhooks → add an endpoint.
  2. Point it at `<branch URL>/api/stripe/webhook?x-vercel-protection-bypass=<secret>`
     (create the bypass secret under Deployment Protection → Protection
     Bypass for Automation). Use the 8 events listed in `REVERT_TO_STRIPE.md`.
  3. Run `vercel env add STRIPE_WEBHOOK_SECRET preview agent-platform`.
- NOP agent billing (`STRIPE_PRICE_AGENT_PRO_MONTHLY`,
  `STRIPE_AGENT_PORTAL_CONFIGURATION_ID`) is intentionally **not** set here
  (NOP is frozen), so it fails closed.
- Test cards: `4242 4242 4242 4242`, any future date, any CVC.

## Creating an admin account on the copy site

Once the branch-scoped Redis vars are in, the copy site has its own empty database, so production accounts don't exist on it.

1. **Owner login.** Open `<branch URL>/login`, click **"Site admin? Sign in with password"**,
   and enter the **Preview** `DASHBOARD_PASSWORD`. This gives you the built-in
   site-owner admin session (`sub = "admin"`) with full `/admin` access. The
   Preview value is a Vercel *sensitive* variable and can't be read back. If
   you don't have it, set a new one:
   `vercel env add DASHBOARD_PASSWORD preview agent-platform`
   (branch-scoped, so other previews keep theirs), then redeploy.
2. **Optional: a named admin account.** Sign up normally at `<branch URL>/login`
   with your email. Then, still signed in as the owner from step 1, run this
   in the browser console:
   ```js
   fetch("/api/admin/set-admin", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ email: "you@example.com", isAdmin: true }),
   }).then(r => r.json()).then(console.log)
   ```
   Only the owner session can grant admin (see `app/api/admin/set-admin`).

Emails sent from the copy site (sign-up codes, password reset) go through
Preview's Resend config, so they're real emails.

## Isolation check (repeatable)

`/api/admin/isolation-probe` returns 404 in production and wherever
`ISOLATION_PROBE_TOKEN` is unset. It returns **409 without sending any Redis
command** unless `UPSTASH_REDIS_REST_URL` equals `AP_KV_REST_API_URL`, i.e.
unless the deployment is really on the `oneflyer-agent-platform` database.

- `POST ?nonce=<n>` writes Redis key `__isolation_probe:<n>` (30-day TTL) and
  private blob `__isolation_probe/<n>`.
- `GET ?nonce=<n>` reports whether each exists and `redisIsAgentPlatformDb`.
  The `marker` and `verdict` fields are informational only (see above).

```bash
H=oneflyer-git-agent-platform-grahampr1s-projects.vercel.app
vercel curl "/api/admin/isolation-probe?nonce=ap-test-1234" --deployment https://$H \
  -- -X POST -H "x-isolation-probe-token: <token>"
```

**The isolation proof is the production-side check, not the label.** After a
POST, run `EXISTS __isolation_probe:<nonce>` in the Upstash console on the
production database (`upstash-KV-Datbase-Oneflyer`). It must return `0`. Run
the same on `oneflyer-agent-platform`, where it must return `1`.
