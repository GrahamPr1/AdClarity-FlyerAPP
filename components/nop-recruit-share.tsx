"use client"

import { useState } from "react"
import { useNop } from "@/components/nop-i18n"

const outline = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-[var(--surface-sunken)]"

/** The agent's recruit link: copy, and the QR as PNG or SVG. No flyer yet (RECRUIT_FLYER_READY). */
export function NopRecruitShare({ link, flyerReady }: { link: string; flyerReady: boolean }) {
  const { t } = useNop()
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="break-all font-mono text-sm" data-testid="recruit-link">{link.replace(/^https?:\/\//, "")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={outline} onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); setCopied(true) }}>{copied ? t("event.copied") : t("event.copy")}</button>
        <a href="/api/enterprise/agent/recruit/qr?format=png" className={outline} data-testid="recruit-qr-png">{t("event.qr_png")}</a>
        <a href="/api/enterprise/agent/recruit/qr?format=svg" className={outline}>{t("event.qr_svg")}</a>
      </div>
      {/* The spot for the recruiting flyer: filled when the program's template arrives (RECRUIT_FLYER_READY). */}
      {!flyerReady && <p data-testid="recruit-flyer-placeholder" className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t("recruit.flyer_placeholder")}</p>}
    </div>
  )
}
