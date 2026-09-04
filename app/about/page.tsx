import Link from "next/link"

export const metadata = {
  title: "About",
  description: "Who built OneFlyer, and why.",
}

// Bio copy supplied by the owner. Nothing here is invented — no founding
// story, no credentials, no dates, no company history beyond what was given.
// If this needs to say more, the words have to come from him.
//
// There is deliberately no photo slot filled in: none was provided, and a
// stock headshot on an About page is worse than no photo at all. Adding one
// later means dropping a file in /public and uncommenting the block below.
export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground md:py-24">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-semibold transition-colors hover:text-[var(--brand-teal-bright)]"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-teal-bright)]" />
          OneFlyer
        </Link>

        <h1 className="mt-8 text-2xl tracking-tight md:text-3xl">About OneFlyer</h1>
        <p className="mt-2 text-sm text-muted-foreground">Who built it, and why.</p>

        {/* Photo slot — add /public/founder.jpg and uncomment when there's a real one.
        <div className="mt-8 h-28 w-28 overflow-hidden rounded-2xl border border-border">
          <Image src="/founder.jpg" alt="" width={112} height={112} className="h-full w-full object-cover" />
        </div>
        */}

        <div className="mt-8 flex flex-col gap-5 text-sm leading-relaxed text-foreground/85">
          <p>
            I&apos;m a young entrepreneur and technology enthusiast passionate about using AI to
            turn ideas into real businesses.
          </p>
          <p>
            I founded AdClarity, an AI-powered agency that helps businesses automate workflows,
            improve marketing, and generate more revenue. I also built OneFlyer, a platform
            designed to help businesses turn a single promotion into an entire marketing campaign.
          </p>
          <p>
            I&apos;m constantly experimenting with new technologies, building products, and finding
            ways to solve real-world problems through innovation. For me, the most exciting part of
            entrepreneurship is taking an idea from nothing and turning it into something people can
            actually use.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base">Why OneFlyer exists</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Most local businesses don&apos;t have a marketing department. They have one promotion
            they want to run and no obvious way to turn it into a flyer, a social post, a text
            blast and a Nextdoor post without either hiring someone or spending an evening
            fighting design software. OneFlyer does that in a few minutes from one description.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link
            href="/#pricing"
            className="rounded-xl bg-[var(--brand-teal-bright)] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[var(--brand-teal)]"
          >
            See pricing
          </Link>
          <a
            href="mailto:support@oneflyer.org"
            className="rounded-xl border border-border px-5 py-2.5 font-medium transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Get in touch
          </a>
        </div>
      </div>
    </main>
  )
}
