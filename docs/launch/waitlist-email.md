# Early Access launch email — DRAFT, not sent

The Early Access modal promised each person: *"We'll email you with a checkout
link when {Plan} billing goes live"* and *"nothing is charged now"*. This email
keeps that promise and nothing more. There is no waitlist discount: the annual
price is the same 20% saving published on the pricing page to everyone, so the
email must not present it as a perk for joining early.

## When and how to send

1. **After** the launch deploy is live and one real checkout has been tested
   end to end in live mode — never before. The link has to work the moment
   someone clicks it.
2. Export the list: `/admin/waitlist` → Export CSV (or
   `GET /api/admin/waitlist?format=csv`). One row per entry; someone who joined
   for two plans has two rows — send them **one** email, using their most
   recent entry.
3. Send as plain text from the normal support address, one email per person,
   with the link for the plan and billing interval they picked (table below).
4. After sending, mark them notified so nobody gets a second email:
   `POST /api/admin/waitlist/notify` with their entry IDs. `convertedAt` then
   fills in on its own when they check out.

## Links and prices by entry

The link opens checkout for exactly what they asked for. Signed out, it goes
through sign-in or sign-up first and then straight on to checkout.

| Plan / billing | Link | Price shown at checkout |
|---|---|---|
| Basic, monthly | https://oneflyer.org/checkout?plan=basic&interval=monthly | $19/month |
| Basic, annual | https://oneflyer.org/checkout?plan=basic&interval=annual | $182.40/year ($15.20/month) |
| Pro, monthly | https://oneflyer.org/checkout?plan=pro&interval=monthly | $39/month |
| Pro, annual | https://oneflyer.org/checkout?plan=pro&interval=annual | $374.40/year ($31.20/month) |

Prices are before tax; sales tax is added at checkout where it applies.

## The email

**Subject:** OneFlyer {Plan} is open — here's your checkout link

> Hi,
>
> A while ago you asked us to let you know when you could sign up for
> OneFlyer {Plan}. You can now.
>
> Here's your link — it goes straight to checkout for {Plan}, billed
> {monthly / yearly}, the option you picked:
>
> {link}
>
> {Plan} is {price}, plus sales tax where it applies, which you'll see before
> you pay. It renews automatically {monthly / yearly} until you cancel, and you
> can cancel online any time from Profile → Manage billing. If you'd rather
> pay {the other interval}, choose it on the pricing page instead:
> https://oneflyer.org/#pricing
>
> Nothing has been charged, and nothing will be unless you complete checkout.
> If you've been using the free tier in the meantime, your account, brand
> details and flyers carry straight over.
>
> If you've changed your mind, there's nothing to do — we won't email you
> about this again.
>
> Thanks for waiting for us,
> Graham
> OneFlyer — support@oneflyer.org

## Notes on the wording

- **No urgency, no discount, no "early access" framing.** Nothing expires and
  nobody on the list gets a better price than anyone else. The yearly figure is
  the standard published price.
- **"We won't email you about this again"** is true only if step 4 above
  (marking them notified) is done. It's also the opt-out: this is a one-off
  message they asked for, not a newsletter.
- **The free-tier sentence** is accurate for signed-in joiners (the modal put
  them on the free tier). For anonymous joiners with no account, it's
  harmless: they'll create one at the link. Drop it if you'd rather send two
  versions.
- Replace "Graham" with whoever signs it.
