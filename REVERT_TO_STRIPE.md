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
