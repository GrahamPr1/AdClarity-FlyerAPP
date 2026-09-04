"use client"

import dynamic from "next/dynamic"

/**
 * Defers the interactive demo's JavaScript.
 *
 * The demo is the heaviest interactive thing on the landing page and it sits
 * well below the fold, so it should not be blocking first paint. Measured:
 * the page transfers ~289KB, ~183KB of it JavaScript, and at the ~400kbps a
 * phone gets on a job site that arithmetic is most of the 5.2s to first
 * paint. Bytes are the problem, so the fix is shipping fewer of them up
 * front.
 *
 * This wrapper exists because `ssr: false` is only legal inside a Client
 * Component, and app/page.tsx is a Server Component — putting the dynamic()
 * call there fails the build outright.
 *
 * ssr:false is right here: the widget is purely interactive, and its initial
 * state is the same example campaign the hero already renders above, so
 * there is nothing worth server-rendering twice.
 *
 * The skeleton has no JavaScript behind it and reserves the same box as the
 * real widget, so the section doesn't jump when it hydrates.
 */
const CampaignDemo = dynamic(() => import("./campaign-demo").then((m) => m.CampaignDemo), {
  ssr: false,
  loading: () => (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12" aria-hidden="true">
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--brand-teal)]/35 bg-[var(--brand-teal-tint)] p-6">
        <div className="h-4 w-24 rounded bg-[var(--surface-soft)]" />
        <div className="h-10 rounded-lg bg-[var(--surface-soft)]" />
        <div className="h-4 w-20 rounded bg-[var(--surface-soft)]" />
        <div className="h-10 rounded-lg bg-[var(--surface-soft)]" />
        <div className="h-4 w-16 rounded bg-[var(--surface-soft)]" />
        <div className="h-10 rounded-lg bg-[var(--surface-soft)]" />
        <div className="mt-2 h-11 rounded-xl bg-[var(--surface-soft)]" />
      </div>
      <div className="min-h-[26rem] rounded-2xl border border-border bg-card" />
    </div>
  ),
})

export function CampaignDemoLazy() {
  return <CampaignDemo />
}
