# Production rollback — fast

Production is Vercel project **oneflyer**: https://oneflyer.org, plus the
`ad-clarity-landing-page.vercel.app` alias that every printed QR code points
at (that alias must always stay public — see "Never do" below). `main` deploys
to production on push.

## The rollback target

| | |
|---|---|
| Deployment ID | `dpl_4opw5psP8oQPmegzjPJLdm8X5V13` |
| Deployment URL | `https://oneflyer-e4vs4ca4q-grahampr1s-projects.vercel.app` |
| Built | Thu 22 Oct 2026, 10:13 ET |
| Commit | `27b36e7` — billing live, Next.js 16.4.1 / React 19.2.9 / sharp 0.35.5 |

> ### ⚠️ Never roll back to anything older than this
>
> **Every production deployment before `dpl_4opw5psP8oQPmegzjPJLdm8X5V13` runs
> Next.js 16.2.0, with critical, unauthenticated remote-code-execution
> vulnerabilities** (Next.js GHSA-2464-fhr4-w9xw and GHSA-673q-mjm6-r5xr,
> React GHSA-xqc2-xf4c-x3h3; see `docs/security/2026-10-svg-audit.md`).
> That includes the pre-billing build `oneflyer-4zq5cpgrs` (`be94df5`) this
> doc used to name, and the launch build `oneflyer-cb3jqtxmf` (`de1bec7`).
> **They must not be used as rollback targets**, even briefly — rolling back
> to one re-opens those holes on the live site.
>
> When a newer deployment has been verified good, move this table forward to
> it. The target is always the newest deployment you have verified, never an
> older one.

Rolling back to this target does **not** remove billing — it *is* a billing
build. To stop people paying, use Step 0.

## Step 0 — try first: turn checkout off (≈1–2 minutes, nothing reverted)

If the problem is in **paying** (checkout won't open, wrong amount or tax,
payments not granting plans) and the rest of the site is fine:

1. Vercel → project **oneflyer** → Settings → Environment Variables → add
   `CHECKOUT_ENABLED` = `false`, **Production** only (or edit it if it exists).
2. Deployments → the current production deployment → ⋮ → **Redeploy**. Env
   changes only apply to a new deployment, and redeploying rebuilds the
   pricing page and `/checkout` together, so they can't disagree.
3. Check https://oneflyer.org/#pricing. Basic and Pro now say **"Paid plans
   are briefly unavailable — check back soon"** instead of a button, and the
   free trial still works.

What keeps working: existing subscribers keep their plans; the Customer Portal
(card updates, plan changes, cancellation) and pause/resume; and the Stripe
webhook, so renewals, refunds and cancellations still sync. A subscriber who
opens a checkout link is sent to the Portal as usual. Only **new** Checkout
Sessions are refused, before any Stripe customer is created.

To turn it back on: set `CHECKOUT_ENABLED=true` (or delete the variable;
unset means on), then **Redeploy**.

If a redeploy itself is the risk (the build is broken, or the site is down),
go to Step 1.

## Decide in one minute: Step 0, Step 1, or fix forward?

- **Step 0** — paying is broken or wrong but the rest of the site works.
- **Step 1** — a deploy newer than the target broke the site (down, errors,
  wrong behaviour outside billing), or Step 0 isn't enough.
- **Fix forward** — an admin-page bug or a cosmetic issue.

## Step 1 — Instant Rollback to the target (≈1 minute, no rebuild)

Either:

- **Dashboard:** Vercel → project **oneflyer** → production deployment tile →
  **Instant Rollback** → pick `oneflyer-e4vs4ca4q` ("Choose another
  deployment" if it isn't offered) → Continue → **Confirm Rollback**.
  **Check the deployment ID before confirming** — do not pick anything older.
- **CLI:** `vercel rollback https://oneflyer-e4vs4ca4q-grahampr1s-projects.vercel.app`
  then `vercel rollback status` until it reports done. (The deployment's own
  `*.vercel.app` URL is behind Vercel Authentication now; the CLI is already
  signed in, so this still works.)

Then confirm, logged out:
- https://oneflyer.org loads, and pricing shows the checkout buttons (or the
  "briefly unavailable" message if Step 0 is on)
- `https://ad-clarity-landing-page.vercel.app/r/<any-code>` reaches the app
  (not a Vercel login page) — printed QR codes depend on it
- in the browser console on oneflyer.org, `next.version` is `16.4.1` or newer

Instant Rollback reuses that build exactly, including the env vars baked in
when it was built. If you changed an env var since (e.g. `CHECKOUT_ENABLED`),
the rolled-back build does not see the change — redeploy to apply it.

**After an Instant Rollback, Vercel stops auto-promoting new production
deploys** until you promote one by hand ("new pushes to your production branch
won't replace the rolled-back deployment"). A push to `main` won't silently
undo the rollback.

**Plan caveat:** on the Hobby plan, Instant Rollback only reaches the
*immediately previous* production deployment; Pro and Enterprise can pick any
earlier one. If the target isn't offered, `vercel promote <target URL>`
promotes it directly, with the same effect.

## Step 2 — Undo the bad change in git (no force-push)

So the next deploy doesn't bring the broken code straight back:

```bash
git checkout main && git pull
git revert <bad-commit-sha>              # or: git revert -m 1 <merge-sha>
git push origin main
```

**Never force-push or reset `main`** (CLAUDE.md). Revert is a normal commit and
keeps history intact. Because auto-promotion is paused after the rollback,
this push builds but doesn't go live until you promote it.

Fix the problem on a branch, check it on its Preview, then **Undo Rollback**
on the production tile (or `vercel promote <deployment>`). That promotes the
new build and turns auto-promotion back on. Once it's verified, move the
target table above forward to it.

## Never do

- **Roll back to a deployment older than the target** (critical RCEs — see the
  warning above).
- **Remove, redirect, or protect `ad-clarity-landing-page.vercel.app`.** It is
  production's site URL today; every QR code ever printed encodes
  `https://ad-clarity-landing-page.vercel.app/r/<code>`. Vercel Standard
  Protection is on for the project and leaves it public because it's a
  production domain — keep it that way.
- Force-push `main`.

## Data

Rolling back between billing-era builds changes no data: they read and write
the same Redis keys. Stripe keeps working throughout — the webhook exists in
every build from the launch onward, so nothing queues up or is lost.

## Things a rollback can't undo

- Charges made in Stripe: refund them in the Dashboard if needed.
- Emails already sent (e.g. the waitlist launch email —
  `docs/launch/waitlist-email.md`).
- Stripe Dashboard settings (prices, portal config, tax registrations).

## The kill switch in one line

`CHECKOUT_ENABLED=false` + Redeploy stops new paid sign-ups and nothing else.
Code: `lib/checkout-switch.ts`; tests: `tests/checkout-switch.test.ts`.
