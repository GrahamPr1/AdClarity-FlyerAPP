import { redirect } from "next/navigation"
import { tNop, type NopStringKey } from "@/lib/enterprise/nop-i18n"
import { nopLangForPage } from "@/lib/enterprise/nop-i18n/server"
import { requirePortalPage } from "@/lib/enterprise/portal/page"
import { canUse } from "@/lib/enterprise/portal/features"
import { canBuyPro } from "@/lib/enterprise/portal/agent-billing"
import { getAgentQrCode, getOrIssueAgentQrCode } from "@/lib/enterprise/nop-qr-code"
import { nopPageLink } from "@/lib/enterprise/portal/agent-page"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { ProLocked } from "@/components/nop-portal"
import { NopEmailSignature } from "@/components/nop-email-signature"
import { PortalShell } from "../portal-shell"

export const dynamic = "force-dynamic"

export async function generateMetadata() {
  const { lang } = await nopLangForPage(null)
  return { title: tNop(lang, "signature.title") }
}

const STEPS: { title: NopStringKey; steps: NopStringKey }[] = [
  { title: "signature.gmail_title", steps: "signature.gmail_steps" },
  { title: "signature.outlook_title", steps: "signature.outlook_steps" },
  { title: "signature.iphone_title", steps: "signature.iphone_steps" },
]

/**
 * /agent/signature — a ready-to-copy email signature with the agent's personal
 * page link and its QR, and plain steps for Gmail, Outlook and iPhone Mail.
 * Pro, while the org has the email signature and the personal page on. An
 * admin viewing as the agent sees it but never issues the agent a code.
 */
export default async function Page() {
  const page = await requirePortalPage()
  const { ctx, lang, readOnly } = page
  const t = (k: NopStringKey) => tNop(lang, k)
  if (!ctx.orgFeatures.emailSignature || !ctx.orgFeatures.agentPage) redirect("/agent")
  if (!canUse(ctx, "emailSignature") || !canUse(ctx, "agentPage")) {
    return (
      <PortalShell page={page} title={t("signature.title")}>
        <ProLocked sentence="signature.locked" upgrade={canBuyPro(ctx)} readOnly={readOnly} />
      </PortalShell>
    )
  }
  const code = readOnly ? await getAgentQrCode(ctx.agent.agentId) : await getOrIssueAgentQrCode(ctx.agent.agentId)
  const p = ctx.agent.profile
  return (
    <PortalShell page={page} title={t("signature.title")} intro={t("signature.intro")}>
      {code ? (
        <NopEmailSignature name={p.displayName ?? p.name} phone={p.displayPhone ?? p.phone} email={p.displayEmail ?? p.email}
          pageUrl={nopPageLink(code)} qrPath={`/p/${encodeURIComponent(code)}/qr`} qrUrl={`${CANONICAL_SITE_URL}/p/${encodeURIComponent(code)}/qr`} />
      ) : (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("portal.page_no_link")}</p>
      )}
      <section aria-labelledby="sig-steps" className="mt-6 flex flex-col gap-3" data-testid="signature-steps">
        <h2 id="sig-steps" className="font-semibold">{t("signature.steps_title")}</h2>
        {STEPS.map((s) => (
          <details key={s.title} className="rounded-2xl border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">{t(s.title)}</summary>
            <ol className="list-decimal border-t border-border px-8 py-3 text-sm">
              {t(s.steps).split("\n").map((line, i) => <li key={i} className="py-0.5">{line}</li>)}
            </ol>
          </details>
        ))}
      </section>
    </PortalShell>
  )
}
