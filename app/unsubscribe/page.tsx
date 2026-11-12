import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CATEGORY_LABEL, EMAIL_CATEGORIES, verifyUnsubscribe, type EmailCategory } from "@/lib/email-preferences"

export const metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

// /unsubscribe — where the link at the foot of every public email lands.
// Asks for one click rather than unsubscribing on arrival: mail security
// scanners open every link in a message, so a page that acted on GET would
// switch people off without them ever seeing it. The button posts to
// /api/email/unsubscribe, which also serves the mail client's own one-click
// button (RFC 8058). No sign-in needed; the link's signature is the proof.
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams
  const done = (EMAIL_CATEGORIES as readonly string[]).includes(q.done ?? "") ? (q.done as EmailCategory) : null
  const target = done ? null : verifyUnsubscribe({ e: q.e, c: q.c, t: q.t })
  const action = target ? `/api/email/unsubscribe?e=${encodeURIComponent(q.e!)}&c=${encodeURIComponent(q.c!)}&t=${encodeURIComponent(q.t!)}` : null

  return (
    <main className="min-h-screen bg-background px-6 py-24 text-foreground">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </div>
        {done ? (
          <>
            <h1 className="mt-6 text-xl tracking-tight">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You won&apos;t get {CATEGORY_LABEL[done]} any more. You can turn them back on any time in your{" "}
              <Link href="/profile#emails" className="text-[var(--brand-teal)] underline">email settings</Link>.
            </p>
          </>
        ) : target && action ? (
          <>
            <h1 className="mt-6 text-xl tracking-tight">Unsubscribe from {CATEGORY_LABEL[target.category]}?</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              For <span className="text-foreground">{target.email}</span>. Your account and everything in it stay exactly as they are.
            </p>
            <form method="post" action={action} className="mt-6">
              <input type="hidden" name="from" value="page" />
              <Button type="submit">Unsubscribe</Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl tracking-tight">This link isn&apos;t valid</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              It may have been copied incompletely. You can change which emails you get in your{" "}
              <Link href="/profile#emails" className="text-[var(--brand-teal)] underline">email settings</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
