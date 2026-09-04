import Image from "next/image"
import { FLYER_SAMPLES, SAMPLES_DISCLAIMER } from "@/lib/samples"

/**
 * Real output the product made, shown as examples.
 *
 * Renders NOTHING when there are no samples. That is deliberate: an absent
 * section is honest, whereas placeholder frames look like a broken page, and
 * inventing testimonials to fill the space is not something this product
 * does. See lib/samples.ts for how to add one.
 */
export function SampleGallery() {
  if (FLYER_SAMPLES.length === 0) return null

  return (
    <section id="samples" className="scroll-mt-24 border-t border-border px-6 py-18 md:px-12 lg:px-20">
      <div className="mx-auto max-w-6xl">
        <span className="text-xs uppercase tracking-widest text-[var(--brand-teal-bright)]">Examples</span>
        <h2 className="mt-3 text-2xl tracking-tight md:text-3xl">See what OneFlyer creates</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Real output from the product — not mockups. Every one was generated the same way yours
          would be: describe the promotion, pick a format, done.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FLYER_SAMPLES.map((s) => (
            <figure key={s.image} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative aspect-[8.5/11] bg-white">
                <Image
                  src={`/samples/${s.image}`}
                  alt={`${s.format} sample — ${s.useCase}`}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-contain"
                />
              </div>
              <figcaption className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{s.label}</span>
                <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                  {s.format}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground/70">{SAMPLES_DISCLAIMER}</p>
      </div>
    </section>
  )
}
