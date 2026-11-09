# DRAFT — Terms and Refund Policy: agent Pro billing (NOP Part 2)

> **Status: for review. Nothing on the live pages has been changed.**
> `app/terms/page.tsx` and `app/refund-policy/page.tsx` are untouched. Publish
> these additions in the same deploy that turns on live agent billing (live
> price, live webhook, live portal configuration). Not before: the pages would
> describe charges that can't happen yet.
>
> Wording drafted by an engineer, not legal advice. **[CHECK]** marks a
> decision only you can make. Every claim below matches the code in
> `lib/enterprise/portal/agent-billing.ts`.

---

## Terms of Service — new section, after "Plans and limits"

### Neighborhood Outreach Program agents

If you joined OneFlyer as an agent of the Neighborhood Outreach Program, these
points apply to your agent account in addition to the rest of these terms.

**Approval.** Agent accounts are reviewed before they can be used. Until your
sign-up is approved you can't download flyers or buy Pro.

**Basic and Pro.** Basic is free and includes the program's flyers. Pro adds
the agent tools shown in your portal (for example your leads). Pro costs
**$40 per month**, billed in advance through Stripe. The price is shown before
tax; any sales tax that applies where you are is calculated from your billing
address and shown at checkout before you pay. We never see or store your full
card number — Stripe holds it.

**Renewal.** Pro renews automatically every month at the current price until
you cancel. If we change the price, we'll email you at least 30 days before it
applies to you.

**Cancelling.** Cancel anytime from your agent portal → Manage billing. You
keep Pro until the end of the month you've already paid for; then your account
moves to Basic. Your leads and history stay.

**If a payment fails.** We retry it, and you keep Pro while we do. If it still
can't be collected, your account moves to Basic. Your leads and history stay,
and you can subscribe again any time.

**Pro set by your organization.** The program may give you Pro without you
paying for it. That Pro is managed by the program, not by your card, and these
billing terms don't apply to it.

**Leader.** The Leader tier isn't for sale; the program assigns it.

[CHECK] The existing 12-month liability cap ("what you paid us in the previous
12 months") already covers agents; for an agent on free Basic that cap is $0.
Confirm that's acceptable, or set a floor.

---

## Cancellation & Refund Policy — new section, after "Refunds"

### Agent Pro (Neighborhood Outreach Program agents)

- **Cancelling.** No contract or notice period. Cancel online from your agent
  portal → Manage billing. Pro lasts until the end of the month you've paid
  for, then your account moves to Basic and doesn't renew.
- **What you keep.** Your leads, scan counts and flyers stay. Lead requests are
  kept and deleted as the Privacy Policy describes.
- **Your QR codes.** Flyers you've already printed keep working whatever your
  plan: the QR code follows your status in the program, not your billing.
- **Refunds.** We don't automatically refund a partial month. If something went
  wrong on our side, or you've barely used Pro, email support@oneflyer.org and
  we'll sort it out. [CHECK: the same rule as SMB monthly plans; change it here
  if agents should be treated differently.]

---

## Decisions needed before publishing

1. **Liability cap for free Basic agents** ([CHECK] above).
2. **Refund rule** for agent Pro: same as SMB monthly (proposed), or different.
3. **Spanish.** The agent portal is bilingual; the Terms and Refund pages are
   English only. A reviewed Spanish version (not a machine translation) may be
   wanted for agents, as with the privacy section.
