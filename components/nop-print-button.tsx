"use client"

import { useNop } from "@/components/nop-i18n"

/** Opens the browser's print dialog. Hidden on the printed page itself. */
export function NopPrintButton() {
  const { t } = useNop()
  return (
    <button type="button" data-testid="sign-print" onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-teal-bright)] px-4 text-sm font-semibold text-[var(--primary-foreground)] print:hidden">
      {t("checkin.print")}
    </button>
  )
}
