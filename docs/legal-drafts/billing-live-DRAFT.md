# ⚠️ DRAFT — NOT PUBLISHED — needs Graham's review before any of this goes live

Proposed changes to **Terms of Service** (`app/terms/page.tsx`) and the
**Cancellation & Refund Policy** (`app/refund-policy/page.tsx`) now that Stripe
billing exists.

**Nothing on the live pages has been changed.** Both pages still say billing is
not live, which is true in production today: the code is merged, but there are
no live keys and no live prices. Publish these edits in the same deploy that
switches on live keys. Not before, because the pages would then claim charges
that can't happen. Not after, because the pages would then deny charges that
are happening.

This is wording drafted by an engineer, not legal advice. The items marked
**[CHECK]** are places where the right answer depends on the law where
customers are, or on a business decision only you can make.

---

## Terms of Service

### 1. Replace the "Billing is not live yet" paragraph (under *Plans and limits*)

Current:

> **Billing is not live yet.** No card is collected and nothing is charged. Paid
> plans are currently enabled manually. When Stripe billing is switched on,
> existing account holders will be told before any charge is made.

Proposed:

> **Paying for a plan.** Basic and Pro are subscriptions, billed in advance
> through Stripe, monthly or yearly. Prices are shown before tax. Any sales
> tax that applies where you are is calculated from your billing address and
> shown at checkout before you pay. Your card isn't stored by us. Stripe
> holds it.
>
> **Renewal.** A subscription renews automatically at the end of each billing
> period, at the price you signed up at, until you cancel. You can cancel at
> any time from **Profile → Manage billing**, and you keep your plan until the
> end of the period you've already paid for. **[CHECK]** If we ever change a
> price, we'll email you at least **[30] days** before it applies to you.
>
> **If a payment fails.** We'll retry it. Your plan stays active while we do.
> If it still can't be collected, your account moves to the free tier. You
> keep everything you've made, and can resubscribe any time.

> **Note on the promise in the current text.** It says existing account holders
> *"will be told before any charge is made."* No one is charged unless they go
> through Checkout themselves, so the switch-on itself charges nobody. Still,
> honour the promise literally: email existing accounts (and the Early Access
> list, see REVERT_TO_STRIPE.md) before or at launch.

### 2. *Plans and limits*: describe the window accurately

Current: *"Limits are enforced on a rolling 30-day window from when your period
started."*

Proposed:

> On a paid plan, your monthly allowance resets on your billing date each
> month. On yearly plans it resets on the same day every month of the year.
> On the free tier it resets every 30 days. Unused campaigns don't roll over.

### 3. *Limitation of liability*: remove the "billing is off" clause

Current ends: *"…limited to what you paid us in the previous three months —
which, while billing is off, is nothing."*

Proposed: *"…limited to what you paid us in the previous three months."*
**[CHECK]** Is three months still the cap you want now that money changes hands?

### 4. Drop the code comment's premise

The header comment in `app/terms/page.tsx` says the page *"states the current,
real state of the product — including that billing is not yet live"*. Update it
when publishing.

---

## Cancellation & Refund Policy

### 5. *Pausing*: say what happens to billing

Current: *"Pausing stops billing and stops new campaigns."* That's accurate:
the code sets Stripe `pause_collection` with behaviour `void`. Proposed addition:

> While you're paused, no invoices are charged. Any that come due are voided,
> not saved up for later. Your billing date doesn't move, so when you resume,
> your next charge is on your usual date.

**[CHECK]** Decide whether this is what you want. Two alternatives: Stripe can
instead keep invoices as drafts, or mark them uncollectible. "Void" matches
the current promise of "billing stops".

### 6. *Cancelling*: replace "email us"

Current: *"Paid plans are month-to-month… Email support@oneflyer.org to cancel
— self-serve cancellation will appear in the dashboard when Stripe billing goes
live. You keep access until the end of the period you've paid for."*

Proposed:

> There's no contract or notice period. Cancel any time from **Profile →
> Manage billing**, in two clicks, with no call or email needed. You keep your
> plan until the end of the period you've already paid for, then the account
> moves to the free tier. Everything you've made stays. Prefer to ask a human?
> Email support@oneflyer.org and we'll do it for you.

> "Month-to-month" is no longer true for everyone, because yearly plans now exist.

**[CHECK]** Auto-renewal laws (California's, among others) require clear
up-front renewal terms, an acknowledgment, and online cancellation as easy as
signing up. Stripe Checkout shows "By subscribing, you authorize … to charge you
according to the terms until you cancel". Have someone confirm that, plus the
Terms text above, meets what you need.

### 7. *Refunds*: cover yearly plans

Add a bullet:

> **Yearly plans.** **[CHECK — your decision]** e.g. "Cancel within 14 days of
> paying for a year and we'll refund it in full. After that, you keep the plan
> to the end of the year and it won't renew." Or: refund unused whole months.

The existing "Changed your mind mid-month — ask" bullet still works for monthly.

### 8. Update the `updated=` date on both pages when publishing.

---

## Also stale once billing is live (not legal pages, flagged for completeness)

- `components/account-status.tsx` was updated in this change: the pause
  confirmation now points to *Manage billing* for cancellation instead of
  saying self-serve cancellation "isn't wired up yet".
- The pause confirmation still lists *"Billing stops. You keep the account."*
  This is now true for subscribers. Free-trial accounts have no billing to stop.
