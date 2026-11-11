import Link from "next/link"
import QRCode from "qrcode"
import { notFound, redirect } from "next/navigation"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { canUse } from "@/lib/enterprise/portal/features"
import { checkInLink, formatEventWhen, getEvent } from "@/lib/enterprise/portal/events"
import { NopLangProvider } from "@/components/nop-i18n"
import { NopPrintButton } from "@/components/nop-print-button"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "checkin.sign_title"), robots: { index: false, follow: false } }
}

/**
 * /agent/events/{id}/sign — a printable check-in sign for one of the agent's
 * own events: the title, date and place, a large QR of the check-in page, and
 * "Scan to check in" in English and Spanish. Nothing else on it (no marketing
 * claims). Letter size; the Print button and back link don't print.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const page = await requirePortalPage()
  if (!canUse(page.ctx, "events")) redirect("/agent/create")
  const event = await getEvent((await params).id)
  if (!event || event.agentId !== page.ctx.agent.agentId || event.cancelledAt || event.hiddenAt) notFound()
  const link = checkInLink(event.code)
  const svg = await QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 1 })
  const t = (k: Parameters<typeof tNop>[1]) => tNop(page.lang, k)
  return (
    <NopLangProvider lang={page.lang}>
      <main className="min-h-screen bg-white text-black print:min-h-0">
        <style>{"@page { size: letter; margin: 0.5in } @media print { html, body { background: #fff } }"}</style>
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-4 pt-4 print:hidden">
          <Link href={`/agent/events/${event.id}`} className="inline-flex min-h-11 items-center text-sm text-gray-600 hover:text-black">{t("checkin.sign_back")}</Link>
          <NopPrintButton />
        </div>
        <article data-testid="checkin-sign" className="mx-auto flex max-w-2xl flex-col items-center px-6 py-10 text-center print:py-0">
          <h1 className="text-4xl font-bold leading-tight" data-testid="sign-title">{event.title}</h1>
          <p className="mt-3 text-xl">{formatEventWhen(event, page.lang)}</p>
          <p className="text-xl">{event.locationName}</p>
          <div className="mt-8 w-[4.5in] max-w-full" data-testid="sign-qr" dangerouslySetInnerHTML={{ __html: svg }} />
          <p lang="en" className="mt-8 text-4xl font-bold">Scan to check in</p>
          <p lang="es" className="mt-2 text-3xl font-semibold">Escanee para registrar su llegada</p>
          <p className="mt-6 font-mono text-base text-gray-700">{link.replace(/^https?:\/\//, "")}</p>
        </article>
      </main>
    </NopLangProvider>
  )
}
