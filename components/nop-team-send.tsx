"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useNop } from "@/components/nop-i18n"
import { flyerLabels } from "@/lib/enterprise/nop-render/flyer-labels"

export interface TeamFlyerOption {
  pkg: string
  pricing: "PRICE" | "NOPRICE" | null
  /** A template id of this flyer, for its label. */
  template: string
}
export interface SentPick {
  id: string
  /** Null: made for the other kit, hidden from the team until it's back. */
  template: string | null
  at: string
}

const outline = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-60"

/** "Send to team": pick one of the program's flyers; it shows on each approved member's Home. Up to 5. */
export function NopTeamSend({ options, picks, readOnly }: { options: TeamFlyerOption[]; picks: SentPick[]; readOnly: boolean }) {
  const { t, lang } = useNop()
  const router = useRouter()
  const [choice, setChoice] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const label = (template: string) => {
    const l = flyerLabels(template)
    return [t(l.eyebrow), t(l.name), l.pricing ? t(l.pricing) : null].filter(Boolean).join(" · ")
  }
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric" })

  async function call(method: "POST" | "DELETE", body: unknown, done: string) {
    setBusy(true); setMsg(null)
    const res = await fetch("/api/enterprise/agent/team/picks", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null)
    setBusy(false)
    setMsg(res?.ok ? done : t("common.generic"))
    router.refresh()
  }

  return (
    <div>
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium" htmlFor="team-flyer">{t("team.send_label")}
            <select id="team-flyer" className="mt-1 block min-h-11 w-full max-w-sm rounded-lg border border-border bg-background px-3" value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
              {options.map((o, i) => <option key={o.template} value={i}>{label(o.template)}</option>)}
            </select>
          </label>
          <button type="button" data-testid="team-send" disabled={busy} className={outline}
            onClick={() => void call("POST", { pkg: options[choice].pkg, pricing: options[choice].pricing }, t("team.sent"))}>{t("team.send")}</button>
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
      <h3 className="mt-4 text-sm font-semibold">{t("team.sent_title")}</h3>
      {picks.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{t("team.sent_none")}</p> : (
        <ul className="mt-1 divide-y divide-border" data-testid="team-picks">
          {picks.map((p) => (
            <li key={p.id} data-testid="team-pick" className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>{p.template ? label(p.template) : t("team.pick_other_kit")} <span className="text-muted-foreground">· {date(p.at)}</span></span>
              {!readOnly && <button type="button" disabled={busy} className={outline} onClick={() => void call("DELETE", { id: p.id }, t("team.removed"))}>{t("team.remove")}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
