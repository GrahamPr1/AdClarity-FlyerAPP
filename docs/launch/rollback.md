# Launch-day rollback — back to the pre-billing site, fast

## What "launch" changes

Launch = merging `stripe-billing` into `main` (which deploys to production on
Vercel project **oneflyer**, https://oneflyer.org), with the live Stripe env
vars already set on Production. The merge switches the paid pricing CTAs from
the Early Access modal to Stripe Checkout, adds the webhook, and publishes the
billing-era Terms, Refund and Privacy pages.

## The rollback target — record it before you merge

The last pre-billing production deployment, checked 2026-10-21:

| | |
|---|---|
| Deployment | `https://oneflyer-4zq5cpgrs-grahampr1s-projects.vercel.app` |
| Built | Fri 9 Oct 2026, 13:07 ET |
| Commit | `be94df5` (tip of `main` before the merge) |

If anything else deploys to production before launch, re-check with
`vercel ls --prod` and update this table — the target is **whatever is serving
oneflyer.org immediately before the merge deploy**.

## Try first: Step 0 — turn checkout off (≈1–2 minutes, nothing reverted)

If the problem is in **paying** (checkout won't open, wrong amount or tax,
payments not granting plans) and the rest of the site is fine, switch off new
paid sign-ups instead of rolling everything back:

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
skip to Step 1.

## Decide in one minute: Step 0, or roll back?

Use **Step 0** if paying is broken or wrong but the rest of the site works:
- checkout won't open, or charges the wrong amount or tax
- payments go through but plans aren't granted (webhook failing). Step 0
  stops new ones while you fix it; the webhook stays live.

**Roll back (Step 1)** if Step 0 isn't enough:
- people get Pro/Basic without paying through some other path
- the site itself is broken or down
- anything outside billing that the merge broke

Don't do either for an admin-page bug or a cosmetic issue — fix forward.

## Step 1 — Instant Rollback (≈1 minute, no rebuild)

Either:

- **Dashboard:** Vercel → project **oneflyer** → production deployment tile →
  **Instant Rollback** → pick the target above ("Choose another deployment" if
  it isn't offered) → Continue → **Confirm Rollback**. Or: Deployments → the
  target's ⋮ menu → **Instant Rollback**.
- **CLI:** `vercel rollback https://oneflyer-4zq5cpgrs-grahampr1s-projects.vercel.app`
  then `vercel rollback status` until it reports done.

Then confirm on https://oneflyer.org (hard refresh):
- the pricing cards show **"Join Basic Early Access" / "Join Pro Early
  Access"** and "Billing coming soon" — the pre-billing site
- `/terms` says "Billing is not live yet"

Instant Rollback reuses that old build exactly, including the env vars baked
in at the time, so the Stripe env vars you added don't affect it. Leave them
set for the roll-forward.

**After an Instant Rollback, Vercel stops auto-promoting new production
deploys** until you promote one by hand. Per Vercel's docs, "new pushes to your
production branch won't replace the rolled-back deployment". That's what you
want: a push to `main` won't silently undo the rollback.

**Plan caveat:** on the Hobby plan, Instant Rollback only reaches the
*immediately previous* production deployment. Pro and Enterprise can pick any
earlier one. So on launch day, **don't push a hotfix to `main` before deciding
whether to roll back**. A hotfix deploy would make the pre-billing build no
longer "previous". If it happens anyway, `vercel promote <target URL above>`
promotes that deployment directly, which has the same effect.

## Step 2 — Stop the bleeding in Stripe (only what applies)

The rolled-back site has no `/api/stripe/webhook`, so Stripe's deliveries get a
404. **Leave the webhook endpoint enabled.** Stripe retries failed live
deliveries for up to 3 days. If you roll forward within that window, the
queued events are processed then, and nothing is lost. If Stripe emails that
the endpoint is failing, that's expected during the rollback.

Then look at who paid during the window — Stripe Dashboard → Customers /
Subscriptions created since the merge:

- **Their plan stays as granted.** The plan the webhook set is an ordinary
  Redis key the old code reads, so paying customers keep Basic/Pro on the
  rolled-back site. Nothing to do for them unless the plan is wrong. If it
  is, use `/admin/users` or `POST /api/admin/set-plan` on the old site.
- **Their subscription keeps billing in Stripe.** If the rollback will last
  more than a day or two, or you can't serve them, either pause collection on
  their subscriptions in the Dashboard, or refund and cancel them.
- **Tell them.** The rolled-back legal pages say billing isn't live while
  they've just paid. A short, honest email ("we've paused new sign-ups while we
  fix X; your plan is active; nothing else is charged until we're back") is
  better than silence.

## Step 3 — Undo the merge in git (no force-push)

So the next deploy doesn't bring the broken code straight back:

```bash
git checkout main && git pull
git revert -m 1 <merge-commit-sha>    # a new commit that undoes the merge
git push origin main
```

**Never force-push or reset `main`** (CLAUDE.md). Revert is a normal commit and
keeps history intact. Because auto-promotion is paused after the rollback,
this push builds but doesn't go live until you promote it. That's fine: the old
deployment is already serving.

Fix the problem on `stripe-billing`. To re-launch, revert the revert
(`git revert <revert-sha>`) or merge again, let it build, check it, then
**Undo Rollback** on the production tile (or `vercel promote <deployment>`).
That promotes the new build and turns auto-promotion back on.

## Data — safe in both directions

- The billing code only **adds** Redis keys (`client:*:billing`,
  `client:*:stripeCustomerId`, `billing:*`, `stripe:*`). The old code ignores
  them. Rolling back deletes nothing, and rolling forward picks them up again.
- Plans, usage counts and flyers use the same keys in both versions.
- The Early Access waitlist data was never touched, and the old site's modal
  works again immediately after the rollback.

## Things that can't be rolled back by Vercel

- Charges made in Stripe: refund them in the Dashboard if needed (Step 2).
- Emails already sent, such as the waitlist launch email. So **send the
  waitlist email only once launch has held for a while**
  (`docs/launch/waitlist-email.md`).
- Stripe Dashboard settings (live products, portal config, tax): these are
  harmless while the old site is up, so leave them in place.

## The kill switch in one line

`CHECKOUT_ENABLED=false` + Redeploy stops new paid sign-ups and nothing else.
Code: `lib/checkout-switch.ts`; tests: `tests/checkout-switch.test.ts`.
