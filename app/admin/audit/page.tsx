"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import type { AuditReport, ClientAudit, Verdict } from "@/lib/audit-test-data"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type AuditResponse = AuditReport & {
  environment: string
  databaseMarker: string | null
  generatedAt: string
}

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  "almost-certainly-test": { label: "Almost certainly test", className: "bg-red-500/15 text-red-300 border-red-500/30" },
  suspicious: { label: "Worth a look", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "looks-real": { label: "Looks real", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: "bad" | "warn" | "good" }) {
  const toneClass =
    tone === "bad" ? "text-red-300" : tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : ""
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

function Row({
  audit,
  selected,
  onToggle,
}: {
  audit: ClientAudit
  selected: boolean
  onToggle: (email: string) => void
}) {
  const style = VERDICT_STYLE[audit.verdict]
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(audit.email)}
            aria-label={`Select ${audit.email} for deletion`}
            className="mt-1 h-4 w-4 shrink-0 accent-red-400"
          />
        <div className="min-w-0">
          <p className="font-medium break-all">{audit.email}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {audit.businessName || <span className="italic">no business name</span>}
            {" · "}
            {audit.plan}
            {" · "}
            {audit.flyersCreated} flyer{audit.flyersCreated === 1 ? "" : "s"} this period
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {audit.createdAt
              ? `created ${new Date(audit.createdAt).toLocaleString()}`
              : "created before signup timestamps were recorded"}
          </p>
        </div>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${style.className}`}>
          {style.label}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {audit.signals.map((s) => (
          <li key={s.code} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                s.strength === "strong" ? "bg-red-400" : "bg-amber-400/70"
              }`}
            />
            <span className={s.strength === "strong" ? "" : "text-muted-foreground"}>{s.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface DeleteResult {
  dryRun: boolean
  deleted: string[]
  wouldDelete: string[]
  details: { email: string; keyCount: number; trackingCodes: string[] }[]
  refused: { email: string; reason: string }[]
}

export default function AuditPage() {
  const { data, error, isLoading, mutate } = useSWR<AuditResponse>("/api/admin/audit", fetcher, {
    revalidateOnFocus: false,
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<DeleteResult | null>(null)
  const [done, setDone] = useState<DeleteResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const toggle = (email: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })

  async function call(dryRun: boolean): Promise<DeleteResult | null> {
    setBusy(true)
    setFailed(null)
    try {
      const res = await fetch("/api/admin/audit", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: Array.from(selected), dryRun }),
      })
      const json = await res.json()
      if (!res.ok) {
        setFailed(json.error ?? "Request failed")
        return null
      }
      return json as DeleteResult
    } catch {
      setFailed("Request failed")
      return null
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← Admin
      </Link>

      <h1 className="mt-4 text-2xl">Test &amp; preview data audit</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Scans every account in the database this deployment is connected to and flags anything that
        looks like it came from testing rather than a real signup. These are heuristics, and nothing
        here is deleted automatically — treat it as a list to review, not a verdict.
      </p>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Scanning…</p>}
      {error && <p className="mt-8 text-sm text-red-400">Could not load the audit.</p>}

      {data && (
        <>
          <div className="mt-6 rounded-xl border border-border bg-[var(--surface-soft)] p-4 text-sm">
            <span className="text-muted-foreground">Connected to the </span>
            <span className="font-medium">{data.databaseMarker ?? "unmarked"}</span>
            <span className="text-muted-foreground"> database, running as </span>
            <span className="font-medium">{data.environment}</span>
            <span className="text-muted-foreground"> · generated {new Date(data.generatedAt).toLocaleString()}</span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Accounts" value={data.totalClients} />
            <StatCard label="Almost certainly test" value={data.counts["almost-certainly-test"]} tone="bad" />
            <StatCard label="Worth a look" value={data.counts.suspicious} tone="warn" />
            <StatCard label="Look real" value={data.counts["looks-real"]} tone="good" />
          </div>

          {data.createdAtRange.earliest && (
            <p className="mt-4 text-xs text-muted-foreground">
              Signups range from {new Date(data.createdAtRange.earliest).toLocaleDateString()} to{" "}
              {new Date(data.createdAtRange.latest as string).toLocaleDateString()}.
            </p>
          )}

          {data.bursts.length > 0 && (
            <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
              <p className="font-medium text-amber-200">
                {data.bursts.length} rapid signup cluster{data.bursts.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Real signups arrive independently. Several arriving within minutes usually means one
                person clicking through a form repeatedly.
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {data.bursts.map((b) => (
                  <li key={b.startedAt}>
                    <span className="text-muted-foreground">{new Date(b.startedAt).toLocaleString()} — </span>
                    {b.emails.length} accounts
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h2 className="mt-10 text-lg">
            Flagged {data.flagged.length > 0 && <span className="text-muted-foreground">({data.flagged.length})</span>}
          </h2>

          {data.flagged.length === 0 ? (
            <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
              <p className="font-medium text-emerald-200">Nothing flagged.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No account in this database matches a test-data pattern.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {data.flagged.map((a) => (
                <Row key={a.email} audit={a} selected={selected.has(a.email)} onToggle={toggle} />
              ))}
            </div>
          )}

          {selected.size > 0 && !done && (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/[0.06] p-5">
              <p className="font-medium text-red-200">
                {selected.size} account{selected.size === 1 ? "" : "s"} selected for deletion
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                This permanently removes the account and everything attached to it — flyers, brand
                profile, and QR tracking records. There is no undo. Preview first to see exactly
                what would go.
              </p>

              {!preview ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => setPreview(await call(true))}
                  className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors"
                >
                  {busy ? "Checking…" : "Preview what would be deleted"}
                </button>
              ) : (
                <>
                  <ul className="mt-4 flex flex-col gap-1.5 text-sm">
                    {preview.details.map((d) => (
                      <li key={d.email}>
                        <span className="font-medium">{d.email}</span>
                        <span className="text-muted-foreground">
                          {" — "}{d.keyCount} keys
                          {d.trackingCodes.length > 0 && `, ${d.trackingCodes.length} QR code(s)`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {preview.refused.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm">
                      <p className="font-medium text-amber-200">Refused by the server:</p>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {preview.refused.map((r) => (
                          <li key={r.email} className="text-muted-foreground">
                            {r.email} — {r.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={busy || preview.wouldDelete.length === 0}
                    onClick={async () => {
                      const result = await call(false)
                      if (result) {
                        setDone(result)
                        setSelected(new Set())
                        setPreview(null)
                        mutate()
                      }
                    }}
                    className="mt-4 rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                  >
                    {busy ? "Deleting…" : `Permanently delete ${preview.wouldDelete.length} account(s)`}
                  </button>
                </>
              )}
              {failed && <p role="alert" className="mt-3 text-sm text-red-400">{failed}</p>}
            </div>
          )}

          {done && (
            <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
              <p className="font-medium text-emerald-200">
                Deleted {done.deleted.length} account{done.deleted.length === 1 ? "" : "s"}.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                {done.details.map((d) => (
                  <li key={d.email}>{d.email} — {d.keyCount} keys removed</li>
                ))}
              </ul>
              {done.refused.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-200/80">
                  {done.refused.map((r) => (
                    <li key={r.email}>{r.email} — {r.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
