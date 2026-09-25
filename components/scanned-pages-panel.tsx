"use client"

import type { PageReport } from "@/lib/agent-pipeline/page-report"

/**
 * What the scanner actually read.
 *
 * The honest alternative to an embedded browser. The crawler is a
 * server-side fetch + cheerio pass with no rendering step, so there are no
 * screenshots to show and never were — an iframe would have displayed the
 * client's homepage, which is NOT what OneFlyer read, and would have gone
 * blank on every site sending X-Frame-Options: DENY.
 *
 * This shows the real thing instead: each URL fetched, its own title, how
 * much readable text came back, and which extracted facts literally appear
 * on it. All of it comes from the crawl that already happened; nothing here
 * triggers another request.
 *
 * `found` is evidence rather than attribution — see buildPageReports. A page
 * with nothing listed still contributed context to the extraction; it just
 * has no verbatim match to point at, and saying so is better than inventing
 * a provenance the extraction never reported.
 */
export function ScannedPagesPanel({
  reports,
  className = "",
}: {
  reports: PageReport[]
  className?: string
}) {
  if (reports.length === 0) return null

  const totalChars = reports.reduce((sum, r) => sum + r.chars, 0)

  return (
    <section className={`rounded-2xl border border-border bg-card p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Pages read
        </p>
        <p className="text-[11px] text-muted-foreground">
          {reports.length} page{reports.length === 1 ? "" : "s"} · {totalChars.toLocaleString()} characters
        </p>
      </div>

      <ul className="mt-3 space-y-2.5">
        {reports.map((r) => {
          let path = r.url
          try {
            const u = new URL(r.url)
            path = u.pathname === "/" ? "/" : u.pathname
          } catch {
            /* keep the raw string if it somehow will not parse */
          }
          return (
            <li key={r.url} className="rounded-xl border border-border bg-[var(--surface-soft)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 flex-1 truncate text-sm font-medium" title={r.title}>
                  {r.title}
                </p>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {r.chars.toLocaleString()} chars
                </span>
              </div>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 block truncate text-xs text-[var(--brand-teal-bright)] transition-colors hover:text-[var(--brand-teal)]"
                title={r.url}
              >
                {path}
              </a>

              {r.found.length > 0 ? (
                <div className="mt-2">
                  <p className="text-[11px] text-muted-foreground">Found here</p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {r.found.map((f) => (
                      <li
                        key={f}
                        className="max-w-full truncate rounded-full border border-border bg-card px-2 py-0.5 text-[11px]"
                        title={f}
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Read for context — nothing quoted directly from this page.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
