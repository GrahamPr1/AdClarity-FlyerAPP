"use client"

import { useRef, useState } from "react"
import { useNop } from "@/components/nop-i18n"

/**
 * The agent's ready-made email signature: name, phone, email, page link and a
 * small QR image of the page (a public image, /p/{code}/qr, so email apps can
 * show it). Copy puts it on the clipboard as formatted text, so it pastes into
 * Gmail, Outlook and iPhone Mail as it looks here.
 */
export function NopEmailSignature({ name, phone, email, pageUrl, qrUrl }: { name: string; phone: string; email: string; pageUrl: string; qrUrl: string }) {
  const { t } = useNop()
  const ref = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null)
  const shown = pageUrl.replace(/^https?:\/\//, "")
  const plain = [name, phone, email, shown].filter(Boolean).join("\n")

  async function copy() {
    const html = ref.current?.innerHTML ?? ""
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) })])
      setCopied("ok")
    } catch {
      // Older browsers: select the signature itself and copy it.
      const sel = window.getSelection()
      const range = document.createRange()
      if (ref.current && sel) { range.selectNodeContents(ref.current); sel.removeAllRanges(); sel.addRange(range) }
      setCopied(document.execCommand("copy") ? "ok" : "failed")
      sel?.removeAllRanges()
    }
  }

  return (
    <div>
      <div className="rounded-2xl border border-border bg-white p-5 text-black" data-testid="signature-preview">
        {/* Email-safe markup: a table and inline styles, nothing else. */}
        <div ref={ref}>
          <table cellPadding={0} cellSpacing={0} style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "14px", lineHeight: "20px", color: "#222222" }}>
            <tbody>
              <tr>
                <td style={{ paddingRight: "12px", verticalAlign: "top" }}>
                  <a href={pageUrl}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- copied into email, so a plain absolute-URL image */}
                    <img src={qrUrl} width={72} height={72} alt={t("signature.qr_alt")} style={{ display: "block", border: 0 }} />
                  </a>
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <strong>{name}</strong><br />
                  {phone && <>{phone}<br /></>}
                  {email && <><a href={`mailto:${email}`} style={{ color: "#1d5f8a" }}>{email}</a><br /></>}
                  <a href={pageUrl} style={{ color: "#1d5f8a" }}>{shown}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" data-testid="signature-copy" onClick={() => void copy()}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--brand-teal-bright)] px-4 text-sm font-semibold text-[var(--primary-foreground)]">
          {t("signature.copy")}
        </button>
        {copied && <span role="status" data-testid="signature-copied" className="text-sm text-muted-foreground">{t(copied === "ok" ? "signature.copied" : "signature.copy_failed")}</span>}
      </div>
    </div>
  )
}
