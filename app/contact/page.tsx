import Link from "next/link"
import { ContactForm } from "@/components/contact-form"

export const metadata = {
  title: "Contact",
  description: "Get in touch with the OneFlyer team.",
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold transition-colors hover:text-[var(--brand-teal-bright)]">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </Link>

        <h1 className="mt-8 text-2xl tracking-tight md:text-3xl">Contact us</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A real person reads these. <strong className="text-foreground">We reply within one business day</strong> —
          usually sooner. You can also email{" "}
          <a href="mailto:support@oneflyer.org" className="text-[var(--brand-teal-bright)] hover:underline">
            support@oneflyer.org
          </a>{" "}
          directly if you prefer.
        </p>

        <div className="mt-8">
          <ContactForm />
        </div>

        <div className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <p>
            Locked out of your account? Use{" "}
            <Link href="/login" className="text-[var(--brand-teal-bright)] hover:underline">
              Forgot password
            </Link>{" "}
            on the login page — it&apos;s faster than waiting on us.
          </p>
        </div>
      </div>
    </main>
  )
}
