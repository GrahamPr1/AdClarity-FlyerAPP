import { LegalPage, H2, UL } from "@/app/legal/legal-page"

export const metadata = { title: "Cancellation & Refund Policy", alternates: { canonical: "/refund-policy" } }

// The QR-after-cancellation answer lives here and is the commitment the FAQ
// and the pause flow both point at. It matches the code: app/r/[code] has no
// plan or subscription check, so a printed code keeps resolving regardless of
// billing state. If that ever changes, this page has to change with it.
//
// Billing claims match lib/billing.ts: pausing sets Stripe pause_collection
// with behavior "void"; the Customer Portal cancels at period end. Refunds
// (including the 14-day yearly one) are issued by hand from the Stripe
// Dashboard — nothing here is automated.
export default function RefundPolicyPage() {
  return (
    <LegalPage title="Cancellation & Refund Policy" updated="21 October 2026">
      <p>
        The short version: you can stop whenever you want, everything you&apos;ve already made
        stays yours, and QR codes you&apos;ve already printed keep working.
      </p>

      <H2>Pausing (the option most people actually want)</H2>
      <p>
        Pausing stops billing and stops new campaigns. It deletes nothing — your brand details,
        every flyer you&apos;ve generated, and all your QR scan history stay exactly as they are.
        Resume any time and pick up where you left off. Pause from your{" "}
        <a href="/profile" className="text-[var(--brand-teal-bright)] hover:underline">profile page</a>.
      </p>
      <p>
        While you&apos;re paused, no invoices are charged. Any that come due are voided, not saved
        up for later. Your billing date doesn&apos;t move, so when you resume, your next charge is
        on your usual date.
      </p>

      <H2>Cancelling</H2>
      <p>
        There&apos;s no contract or notice period, on monthly or yearly plans. Cancel anytime
        online from your{" "}
        <a href="/profile" className="text-[var(--brand-teal-bright)] hover:underline">profile page</a>{" "}
        → <strong>Manage billing</strong> — no call or email needed. You keep your plan until the
        end of the period you&apos;ve already paid for, then the account moves to the free tier and
        it doesn&apos;t renew. Everything you&apos;ve made stays. Prefer to ask a human? Email{" "}
        <a href="mailto:support@oneflyer.org" className="text-[var(--brand-teal-bright)] hover:underline">
          support@oneflyer.org
        </a>{" "}
        and we&apos;ll do it for you.
      </p>

      <H2>What happens to your QR codes — the important part</H2>
      <p>
        <strong>They keep working. Permanently.</strong> A QR code printed on a flyer is out in the
        world on paper, and we are not willing to make that paper stop working because you stopped
        paying us. Concretely:
      </p>
      <UL>
        <li>The offer page behind every QR code you&apos;ve generated stays live.</li>
        <li>Scans and clicks keep being counted.</li>
        <li>Numbers you&apos;ve already collected remain visible in your dashboard.</li>
        <li>What stops is creating <em>new</em> campaigns. That needs an active plan.</li>
      </UL>
      <p>
        The one exception is if you ask us to delete your account outright. Deletion means
        deletion, and that includes the offer pages your QR codes point at — so if you have flyers
        in circulation, pause instead, or tell us to keep the tracking records when you ask for
        deletion.
      </p>

      <H2>Refunds</H2>
      <UL>
        <li>
          <strong>Free tier.</strong> Nothing to refund — it exists so you can judge the quality
          before paying.
        </li>
        <li>
          <strong>Something went wrong on our side.</strong> If the product failed to deliver what
          you paid for, email us and we&apos;ll refund you. We&apos;d rather do that than argue.
        </li>
        <li>
          <strong>Yearly plans.</strong> Cancel within 14 days of paying for a year and we&apos;ll
          refund the full year and end the plan. After that, the plan runs to the end of the year
          you&apos;ve paid for and doesn&apos;t renew.
        </li>
        <li>
          <strong>Monthly plans — changed your mind mid-month.</strong> We don&apos;t automatically
          pro-rate a partial month, but ask — if you&apos;ve barely used it, we&apos;ll sort it out.
        </li>
        <li>
          <strong>Print orders.</strong> Refundable until printing starts. Once physical copies are
          produced they can&apos;t be refunded, which is why nothing is charged until you accept a
          quote.
        </li>
      </UL>

      <H2>Deleting your data</H2>
      <p>
        Ask and we&apos;ll delete your account, brand profile, campaigns, uploaded photos and QR
        tracking records. We&apos;ll confirm from the account&apos;s own email address first, and
        we&apos;ll tell you plainly what will stop working before we do it.
      </p>
    </LegalPage>
  )
}
