import { LegalPage, H2, UL } from "@/app/legal/legal-page"
import { PLAN_LIMITS } from "@/lib/types"

export const metadata = { title: "Terms of Service" }

// Deliberately states the real state of the product, written against the code:
// Stripe subscriptions (lib/billing.ts — renewal, failed-payment retries and
// the free-tier fallback), the usage window (lib/usage-window.ts — resets on
// the billing date only once that period is paid), and flyer downloads.
// Claiming more than the product does is what this page exists to avoid.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="21 October 2026">
      <p>
        These terms cover your use of OneFlyer. Plain language on purpose — if something here is
        unclear, ask us rather than guessing.
      </p>

      <H2>What OneFlyer does</H2>
      <p>
        You describe your business and a promotion. We generate a print-ready flyer and, on paid
        plans, a matching Instagram design and caption, a text-message blurb, a Nextdoor post, and
        a trackable QR code. Flyers are self-contained HTML files. You can print one directly from your
        dashboard or download it as a PDF or as HTML; each format prints at
        its real physical size.
      </p>

      <H2>Your account</H2>
      <UL>
        <li>You need an account, and you&apos;re responsible for keeping your password to yourself.</li>
        <li>One account is for one business. Don&apos;t share logins across separate companies.</li>
        <li>You must be 18 or older and authorised to market the business you describe.</li>
      </UL>

      <H2>Plans and limits</H2>
      <p>
        Free includes {PLAN_LIMITS.trial} campaigns. Basic includes {PLAN_LIMITS.basic} per month
        and Pro includes {PLAN_LIMITS.pro} per month. On a paid plan your monthly allowance resets
        on your billing date, once that period&apos;s payment has gone through; on a yearly plan it
        resets on the same date every month of the year. On the free tier it resets every 30 days.
        Unused campaigns don&apos;t roll over.
      </p>
      <p>
        <strong>Paying for a plan.</strong> Basic and Pro are subscriptions, billed in advance
        through Stripe, monthly or yearly. Prices are shown before tax; any sales tax that applies
        where you are is calculated from your billing address and shown at checkout before you
        pay. We never see or store your full card number — Stripe holds it.
      </p>
      <p>
        <strong>Renewal.</strong> Your subscription renews automatically at the end of each
        billing period, monthly or yearly, at the plan&apos;s current price, until you cancel.
        If we change a price, we&apos;ll email you at least 30 days before it applies to you.
        Cancel anytime online from <strong>Profile → Manage billing</strong>; you keep your plan
        until the end of the period you&apos;ve already paid for.
      </p>
      <p>
        <strong>If a payment fails.</strong> We retry it, and your plan stays active while we do.
        If it still can&apos;t be collected, your account moves to the free tier. You keep
        everything you&apos;ve made, and can resubscribe any time.
      </p>

      <H2>What you own</H2>
      <p>
        Everything we generate for you is yours. Use it commercially, print it, edit it, keep it
        after you stop paying. We don&apos;t claim rights over your flyers, your logo, your photos
        or your brand.
      </p>

      <H2>What you&apos;re responsible for</H2>
      <UL>
        <li>
          <strong>The truth of your claims.</strong> We generate copy from what you tell us. If you
          say you&apos;re licensed and insured, that&apos;s your statement, not our verification.
        </li>
        <li>
          <strong>Checking before you print.</strong> AI generates these designs. Read the flyer
          before spending money printing a thousand of them. We are not liable for print costs
          arising from an error you could have caught on screen.
        </li>
        <li>
          <strong>Rights to what you upload.</strong> Only upload photos and logos you&apos;re
          allowed to use.
        </li>
        <li>
          <strong>Following the law where you operate.</strong> Including the rules on
          advertising, text-message marketing and unsolicited mail in your area.
        </li>
      </UL>

      <H2>What we won&apos;t generate</H2>
      <p>
        We refuse content that is illegal, hateful, adult, deceptive, or that impersonates another
        business. We may decline a request or remove an account for it.
      </p>

      <H2>Printing</H2>
      <p>
        Print requests are quotes, not orders. You tell us a quantity and address; we email you a
        price and turnaround; nothing is printed or charged until you accept. Printing is not part
        of your subscription.
      </p>

      <H2>Availability</H2>
      <p>
        We aim to keep OneFlyer running but don&apos;t promise uninterrupted service. Generation
        depends on third-party AI providers and can occasionally fail or time out — when it does,
        the campaign is marked failed and you can retry without it counting again.
      </p>

      <H2>Limits of liability</H2>
      <p>
        OneFlyer is provided as-is. We&apos;re not liable for lost business, lost profits, or
        printing costs. Where liability can&apos;t be excluded, it&apos;s limited to what you paid
        us in the previous 12 months.
      </p>

      <H2>Ending it</H2>
      <p>
        You can pause or close your account whenever you like — see the{" "}
        <a href="/refund-policy" className="text-[var(--brand-teal-bright)] hover:underline">
          Cancellation &amp; Refund Policy
        </a>
        . We may close an account that breaches these terms, and will say why.
      </p>
    </LegalPage>
  )
}
