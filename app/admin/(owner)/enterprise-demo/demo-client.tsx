"use client"

import { useState } from "react"
import Link from "next/link"
import type { AttributedBlock } from "@/lib/agent-pipeline/attribution"
import type { EnterpriseDemoData } from "./data"

/**
 * Generation goes through the real /api/intake route, which already allows an
 * admin to submit on behalf of another email. The demo therefore demonstrates
 * that the production path works, not that a demo-shaped copy of it works.
 */

const DEFAULT_NOTES =
  "Educational event for people approaching retirement — Thursday, October 8, 6:00 PM, Bowling Green Public Library. Cover the retirement income options: guaranteed lifetime income, flexible withdrawal schedules, and spousal continuation."

/* ------------------------------- Provenance ------------------------------- */

type Kind = "locked-exact" | "unlocked-exact" | "adapted" | "violation" | "generated"

function kindOf(b: AttributedBlock): Kind {
  if (b.fidelity === "generated") return "generated"
  if (b.locked && b.fidelity === "adapted") return "violation"
  if (b.fidelity === "adapted") return "adapted"
  return b.locked ? "locked-exact" : "unlocked-exact"
}

/**
 * Two facts per block, deliberately not collapsed into one sourced/generated
 * badge: which asset it came from (and whether that asset is locked), and how
 * faithfully it was reproduced. "From the approved sheet, reworded" and "the
 * exact approved text" are different things to sign off on — see item 1 in
 * docs/enterprise-pilot-readiness.md.
 */
const KIND_STYLE: Record<Kind, { label: string; chip: string; rail: string; note: string }> = {
  "locked-exact": {
    label: "Locked · exact",
    chip: "bg-emerald-600/10 text-emerald-800 border-emerald-700/30",
    rail: "border-l-emerald-500",
    note: "Compliance-controlled text, reproduced character for character.",
  },
  "unlocked-exact": {
    label: "Approved · exact",
    chip: "bg-sky-600/10 text-sky-800 border-sky-700/30",
    rail: "border-l-sky-500",
    note: "Quoted verbatim from an approved asset that permits rewording.",
  },
  adapted: {
    label: "Approved · adapted",
    chip: "bg-amber-500/15 text-amber-900 border-amber-700/35",
    rail: "border-l-amber-500",
    note: "Traceable to an approved asset but reworded — the wording on the page is not the wording that was approved.",
  },
  violation: {
    label: "Locked · ALTERED",
    chip: "bg-red-600/10 text-red-800 border-red-700/40",
    rail: "border-l-red-500",
    note: "A locked asset was not reproduced exactly. This is a compliance failure, not a style choice.",
  },
  generated: {
    label: "AI-generated",
    chip: "bg-zinc-500/10 text-zinc-700 border-zinc-600/30",
    rail: "border-l-zinc-600",
    note: "The model's own connective copy — greeting, logistics, or contact details.",
  },
}

function Chip({ kind }: { kind: Kind }) {
  const s = KIND_STYLE[kind]
  return <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${s.chip}`}>{s.label}</span>
}

/**
 * For an ASSET rather than a block. An asset has no fidelity — it is the thing
 * fidelity is measured against — so reusing the block chips here would label a
 * library entry "exact", which means nothing and invites the reader to think
 * exactness has been checked on the asset itself.
 */
function LockChip({ locked }: { locked: boolean }) {
  const cls = locked
    ? "bg-emerald-600/10 text-emerald-800 border-emerald-700/30"
    : "bg-sky-600/10 text-sky-800 border-sky-700/30"
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {locked ? "Locked · verbatim only" : "Unlocked · may be reworded"}
    </span>
  )
}

/* ---------------------------------- Page ---------------------------------- */

export default function EnterpriseDemoClient({
  email,
  initial,
}: {
  email: string
  initial: EnterpriseDemoData
}) {
  const [notes, setNotes] = useState(DEFAULT_NOTES)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<EnterpriseDemoData>(initial)

  async function refresh(): Promise<EnterpriseDemoData | null> {
    const res = await fetch(`/api/admin/enterprise-demo?email=${encodeURIComponent(email)}`, { cache: "no-store" })
    if (!res.ok) {
      setError(`Could not refresh demo data (HTTP ${res.status}).`)
      return null
    }
    const body = (await res.json()) as EnterpriseDemoData
    setData(body)
    return body
  }

  async function generate() {
    setError(null)
    setRunning(true)
    const startedFrom = data.flyer?.id ?? null

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: null,
          businessCategory: "Other",
          businessName: "Dana Reyes, Northstar Mutual",
          industry: "Retirement income planning",
          yearsInBusiness: "12",
          services: [{ id: "s1", name: "Retirement income planning" }],
          preferredStyle: "modern",
          voiceTone: "warm, plain-spoken",
          targetAudience: "people approaching retirement",
          contact: {
            email,
            phone: "555-0142",
            address: "Bowling Green, KY",
            website: "",
            socialHandles: "",
          },
          wantsAiPhotos: false,
          wantsQrCode: true,
          flyerNotes: notes,
          websitePreferences: "",
        }),
      })
      if (!res.ok) {
        setError(`Generation request failed (HTTP ${res.status}). ${(await res.text()).slice(0, 300)}`)
        return
      }

      // The pipeline runs past the response via waitUntil, so poll for the new
      // flyer rather than expecting it in the POST body.
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const body = await refresh()
        const f = body?.flyer
        if (f && f.id !== startedFrom && (f.status === "Ready" || f.status === "Failed")) break
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const { blocks, summary, library, flyer } = data
  const hasViolation = summary.violations > 0

  return (
    <div className="px-6 md:px-10 lg:px-16 py-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl tracking-tight">Enterprise demo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generates as <code className="text-foreground">{email}</code>
            {data.orgId ? (
              <>
                {" "}
                against org <code className="text-foreground">{data.orgId}</code>
              </>
            ) : null}
            . Internal only.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Admin
        </Link>
      </div>

      <p className="mt-4 rounded-md border border-amber-700/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
        <strong>Fictional content.</strong>{" "}
        Northstar Mutual is not a real carrier and these are not a real compliance
        team&rsquo;s approved strings. No real carrier library should run through this path — see{" "}
        <code>docs/enterprise-pilot-readiness.md</code>.
      </p>

      {/* ------------------------------ Library ----------------------------- */}
      <section className="mt-8">
        <h2 className="text-lg tracking-tight">Approved content library</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {library.map((a) => (
            <div key={a.assetId} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{a.label}</span>
                <LockChip locked={a.locked} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{a.content}</p>
            </div>
          ))}
          {library.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No assets found. Run <code>npm run seed:enterprise-demo</code>.
            </p>
          ) : null}
        </div>
      </section>

      {/* ------------------------------- Input ------------------------------ */}
      <section className="mt-8">
        <h2 className="text-lg tracking-tight">Promotion request</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          disabled={running}
          className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm leading-relaxed disabled:opacity-60"
          aria-label="Promotion request"
        />
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={generate}
            disabled={running || library.length === 0}
            className="rounded-md bg-[var(--brand-teal-bright)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {running ? "Generating…" : "Generate flyer"}
          </button>
          {running ? (
            <span className="text-sm text-muted-foreground">Running the real pipeline — this takes a minute or two.</span>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </section>

      {/* ------------------------------ Output ------------------------------ */}
      {flyer ? (
        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 className="text-lg tracking-tight">
              Output <span className="text-sm text-muted-foreground">({flyer.status})</span>
            </h2>
            {flyer.html ? (
              <iframe
                title="Generated flyer"
                srcDoc={flyer.html}
                className="mt-3 w-full rounded-lg border border-border bg-white"
                style={{ height: 1100, maxHeight: "70vh" }}
              />
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No rendered flyer on this deliverable.</p>
            )}
          </div>

          {/* ----------------------------- Sources ---------------------------- */}
          <div>
            <h2 className="text-lg tracking-tight">Sources</h2>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded border border-emerald-700/30 bg-emerald-600/10 px-2 py-1 text-emerald-800">
                {summary.exact} exact
              </span>
              <span className="rounded border border-amber-700/35 bg-amber-500/15 px-2 py-1 text-amber-900">
                {summary.adapted} adapted
              </span>
              <span className="rounded border border-zinc-600/30 bg-zinc-500/10 px-2 py-1 text-zinc-700">
                {summary.generated} generated
              </span>
              {hasViolation ? (
                <span className="rounded border border-red-700/40 bg-red-600/10 px-2 py-1 font-medium text-red-800">
                  {summary.violations} verbatim violation(s)
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground">Assets the agent claimed</h3>
              <ul className="mt-2 space-y-1">
                {flyer.sources.length === 0 ? (
                  <li className="text-sm text-muted-foreground">None — this was not an enterprise generation.</li>
                ) : (
                  flyer.sources.map((s) => (
                    <li key={s.assetId} className="flex items-center gap-2 text-sm">
                      <LockChip locked={s.locked} />
                      <span>{s.label}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium text-muted-foreground">Block by block</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Derived from the rendered page, not declared by the model.
              </p>
              <ul className="mt-3 space-y-2">
                {blocks.map((b, i) => {
                  const kind = kindOf(b)
                  const s = KIND_STYLE[kind]
                  return (
                    <li key={i} className={`rounded-r border-l-4 bg-card/60 px-3 py-2 ${s.rail}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip kind={kind} />
                        {b.label ? <span className="text-xs text-muted-foreground">{b.label}</span> : null}
                        {b.fidelity === "adapted" && b.coverage !== null ? (
                          <span className="text-xs text-muted-foreground">{Math.round(b.coverage * 100)}% traceable</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-snug">{b.text}</p>
                      {kind === "adapted" || kind === "violation" ? (
                        <p className="mt-1 text-xs text-amber-900/90">{s.note}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-medium">Legend</h3>
              <ul className="mt-2 space-y-2">
                {(Object.keys(KIND_STYLE) as Kind[]).map((k) => (
                  <li key={k} className="flex gap-2">
                    <Chip kind={k} />
                    <span className="text-xs text-muted-foreground">{KIND_STYLE[k].note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
