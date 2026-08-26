import { LegalPage, H2, UL } from "@/app/legal/legal-page"

export const metadata = { title: "Privacy Policy" }

// Written against what the code actually does, not a template. Every claim
// here is traceable: Upstash Redis (lib/store.ts), Vercel Blob
// (app/api/onboarding/upload-photo), Anthropic (lib/agent-pipeline), Resend
// (lib/email.ts), and the QR redeem page (app/r/[code]).
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="25 August 2026">
      <p>
        OneFlyer is run by a small team. This page describes what we actually store and who
        actually sees it — not what a generic template says a company might do.
      </p>

      <H2>What we collect</H2>
      <UL>
        <li>
          <strong>Your account.</strong> Email address and a password. Passwords are never stored
          as text — we keep a PBKDF2-SHA256 hash, so we cannot read yours or recover it for you.
        </li>
        <li>
          <strong>What you tell us about your business.</strong> Business name, trade, services,
          target audience, phone number, and optionally an address, website and social handles.
          This is used to generate your marketing and is reused on later campaigns so you
          don&apos;t re-type it.
        </li>
        <li>
          <strong>Files you upload.</strong> Photos you add to a campaign. Stored privately and
          served through our own server rather than from a public bucket.
        </li>
        <li>
          <strong>Your website, if you ask us to read it.</strong> The website-scan step fetches
          your public pages to pre-fill onboarding. We keep what it extracted, not a copy of your
          site.
        </li>
        <li>
          <strong>QR scan counts.</strong> For each flyer&apos;s QR code we count how many times
          its offer page was opened and how many times the call-to-action was tapped. Two numbers.
          We do not log who scanned, their IP address, their location, or their device.
        </li>
      </UL>

      <H2>What we don&apos;t collect</H2>
      <p>
        No advertising trackers, no third-party analytics pixels, no selling or renting of your
        data to anyone, ever. We do not collect payment card details — when billing goes live it
        will be handled by Stripe, and card numbers will go to Stripe rather than to us.
      </p>

      <H2>Who processes it</H2>
      <UL>
        <li>
          <strong>Vercel</strong> — hosting, and file storage for uploaded photos.
        </li>
        <li>
          <strong>Upstash</strong> — the database holding your account, campaigns and counts.
        </li>
        <li>
          <strong>Anthropic</strong> — the AI models that write and design your campaign. Your
          business details and your promotion are sent to generate it.
        </li>
        <li>
          <strong>Resend</strong> — transactional email, such as password resets.
        </li>
        <li>
          <strong>Higgsfield</strong> — only if you are on Pro and explicitly opt in to
          AI-generated photos. Otherwise it is never called.
        </li>
      </UL>

      <H2>Anyone who scans one of your QR codes</H2>
      <p>
        The offer page behind your QR code is public — that&apos;s the point of a QR code on a
        flyer. It shows the offer you created. Visitors are not asked for anything and are not
        individually identified or tracked.
      </p>

      <H2>How long we keep things</H2>
      <p>
        For as long as your account exists. Pausing your account changes nothing about storage —
        it stops new campaigns, and everything you&apos;ve made stays exactly as it was. If you
        ask us to delete your account, we delete your account record, brand profile, campaigns,
        uploaded photos and QR tracking records. See the{" "}
        <a href="/refund-policy" className="text-[var(--brand-teal-bright)] hover:underline">
          Cancellation &amp; Refund Policy
        </a>{" "}
        for what that means for QR codes already printed on paper.
      </p>

      <H2>Your choices</H2>
      <p>
        Email <a href="mailto:support@oneflyer.org" className="text-[var(--brand-teal-bright)] hover:underline">support@oneflyer.org</a> to
        get a copy of your data, correct it, or have it deleted. We&apos;ll confirm from the
        address on the account before acting on any of those.
      </p>

      <H2>Children</H2>
      <p>OneFlyer is a tool for businesses and is not directed at anyone under 18.</p>

      <H2>Changes</H2>
      <p>
        If this policy changes in a way that affects what we collect or who we send it to,
        we&apos;ll email account holders rather than quietly changing the date at the top.
      </p>
    </LegalPage>
  )
}
