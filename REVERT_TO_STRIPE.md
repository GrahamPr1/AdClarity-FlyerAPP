> **Status (2026-10-21): the code revert below is DONE, in sandbox.** Paid CTAs
> go to `/checkout` (Stripe Checkout); the plan is set only by the webhook
> (`app/api/stripe/webhook`). The modal, the badge, the dashboard banner and
> the `NEXT_PUBLIC_EARLY_ACCESS` toggle (`lib/early-access.ts`) are gone. The
> waitlist data, `/admin/waitlist` and the API routes are kept, and a
> completed checkout now stamps `convertedAt`. Billing is visible to admins at
> the top of `/admin` (members, activity log, Free-Pro audit).
>
> Graham is handling the "Before you flip it" emails below himself. The Terms
> and Cancellation & Refund pages are updated on this branch for live billing
> (decisions recorded in `docs/legal-drafts/billing-live-DRAFT.md`), as is the
> Privacy Policy — they go live with the merge. Stripe's renewal-reminder and
> receipt emails are switched on in the live Dashboard by Graham.
>
> ## Live launch checklist
>
> 1. **Live products and prices**, created by hand in the live Dashboard
>    (`npm run stripe:setup` refuses live keys): Basic $19/mo and $182.40/yr,
>    Pro $39/mo and $374.40/yr, all **tax-exclusive**, USD.
> 2. **Live Customer Portal configuration**: payment method update, invoice
>    history, cancel **at period end** with cancellation reasons, plan switching
>    between the four live prices. Note its `bpc_` ID.
> 3. **Stripe Tax**: real head office address and real registrations (the
>    sandbox has a placeholder address and a sandbox-only Kentucky
>    registration). **Without a head office address, Checkout refuses to open
>    at all** ("You must have a valid head office address to enable automatic
>    tax calculation") — every paid CTA fails. With an address but no
>    registration, Checkout works and tax computes $0 everywhere.
> 4. **Webhook endpoint** `https://<domain>/api/stripe/webhook`, subscribed to
>    **all nine** events the handler processes:
>    - `checkout.session.completed`
>    - `customer.subscription.created`
>    - `customer.subscription.updated`
>    - `customer.subscription.deleted`
>    - `invoice.paid`
>    - `invoice.payment_failed`
>    - `charge.refunded`
>    - `charge.dispute.created`
>    - `charge.dispute.closed`
>
>    Missing any of the first six breaks plans or usage resets. Missing the
>    refund/dispute events leaves them off the admin pages, and without
>    `charge.dispute.closed` a resolved dispute stays in Needs-attention.
> 5. **Production env vars** (Production scope only — never Preview):
>    `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (from that endpoint), the four
>    `STRIPE_PRICE_*`, `STRIPE_PORTAL_CONFIGURATION_ID`. Set them BEFORE the
>    merge deploys — the merge switches the paid CTAs to checkout.
>    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not read by the app. `lib/stripe.ts`
>    refuses a live key outside production. Verify with
>    `vercel env pull --environment=production` + `npm run env:check`.
>    Leave `CHECKOUT_ENABLED` **unset** at launch (unset = on). It is the
>    checkout kill switch: `false` + Redeploy stops new paid sign-ups and
>    keeps subscribers, the Portal and webhooks working. See
>    `docs/launch/rollback.md`, Step 0.
> 6. Check `/admin/billing/audit` and decide what to do about any account on a
>    paid plan with no subscription and no logged override.
> 7. **Annual refunds are manual — make it a routine.** The refund policy
>    promises: cancel within 14 days of paying for a year and we refund the
>    full year *and end the plan*. Nothing automates this. When **"Annual
>    refund due"** appears in Needs-attention on `/admin`:
>    1. In the Stripe Dashboard, refund that payment **in full**.
>    2. Then cancel the subscription **immediately** (not at period end) —
>       a Portal cancellation only ends it at the end of the year.
>
>    The flag clears when the full refund's `charge.refunded` arrives; the
>    immediate cancellation sends `customer.subscription.deleted`, which moves
>    the account to the free tier. A partial refund leaves the flag up.

# Reverting Early Access to real Stripe checkout

The paid pricing CTAs currently open an Early Access modal instead of a
checkout session, because Stripe isn't connected — the price IDs in
`lib/plans.ts` are still `price_*_placeholder`. This file is how to undo that
once it is.

Every place to change carries a `STRIPE_REVERT` comment. Search the repo for
that string.

## Before you flip it

**Email the people already on the list first.** They asked to be told when
checkout opened, and switching the button over without telling them means the
signal you collected goes to waste and the promise made in the modal is
quietly broken.

1. `GET /api/admin/waitlist?format=csv` — export everyone.
2. Send them a checkout link.
3. `POST /api/admin/waitlist/notify` with their entry ids, so the admin table
   shows who has already been contacted and nobody gets two emails.

## Turning Early Access OFF without reverting anything

There is now a toggle for this, added so the paid flow can be tested without
editing components: `NEXT_PUBLIC_EARLY_ACCESS=off` (see `lib/early-access.ts`).

It hides the Early Access buttons, the "Billing coming soon" badge and the
dashboard waitlist banner, letting the paid CTAs fall through to their
original `/onboarding?plan=<id>` behaviour.

**It does not open billing.** There is still no checkout, so anyone who signs
in gets that plan for free with the real server-side entitlements behind it —
50 flyers/month and AI photos on Pro, each costing real API spend. It defaults
to ON precisely so a deploy that forgets to set it cannot start giving the
paid tiers away. Treat leaving it off in production as a deliberate decision
with a cost, not a config detail.

The steps below are the permanent revert, for when Stripe is actually
connected. The toggle is not a substitute for them.

## The change

1. **`components/pricing-cards.tsx`** — at the `STRIPE_REVERT` comment, drop
   the `isPaid` branch that calls `onJoinWaitlist`. The `plan.ctaHref` /
   `onSubscribe` branches beneath it are the original behaviour, untouched and
   still working. Point `handleSubscribe` at your real checkout route instead
   of `/onboarding?plan=`.
2. **Same file** — remove the "Billing coming soon" badge under the price.
3. **`lib/plans.ts`** — replace the four placeholder Stripe price IDs with
   real ones.
4. **`components/dashboard-client.tsx`** — remove the waitlist banner at its
   `STRIPE_REVERT` comment.
5. **`components/waitlist-modal.tsx`** — delete once nothing renders it.

## Keep the data

Do **not** delete the waitlist store, `/admin/waitlist`, or the API routes.

The entries are the only record of who wanted to pay before they could, which
plan they picked, and whether they converted once they could. That's cohort
data you can't reconstruct later, and `convertedAt` exists specifically so the
answer to "did Early Access signups actually buy?" stays answerable.

`POST /api/waitlist` can stay live too — it's harmless with checkout running,
and useful again the next time something ships ahead of its billing.
