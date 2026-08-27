import { LegalPage, H2, UL } from "@/app/legal/legal-page"
import { PLAN_LIMITS } from "@/lib/types"

export const metadata = { title: "Terms of Service" }

// Deliberately states the current, real state of the product — including that
// billing is not yet live and that flyers download as HTML. Claiming
// otherwise would be the kind of over-statement this page exists to avoid.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="25 August 2026">
      <p>
        These terms cover your use of OneFlyer. Plain language on purpose — if something here is
        unclear, ask us rather than guessing.
      </p>

      <H2>What OneFlyer does</H2>
      <p>
        You describe your business and a promotion. We generate a print-ready flyer and, on paid
        plans, a matching Instagram design and caption, a text-message blurb, a Nextdoor post, and
        a trackable QR code. Flyers are self-contained HTML files. You can print one directly from your
        dashboard, or save it as a PDF through the same browser print dialog;
        each format prints at its real physical size. There is no separate
        one-click PDF download.
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
        and Pro includes {PLAN_LIMITS.pro} per month. Limits are enforced on a rolling 30-day
        window from when your period started, and unused campaigns do not roll over.
      </p>
      <p>
        <strong>Billing is not live yet.</strong> No card is collected and nothing is charged. Paid
        plans are currently enabled manually. When Stripe billing is switched on, existing account
        holders will be told before any charge is made.
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
        us in the previous three months — which, while billing is off, is nothing.
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
