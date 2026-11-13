import { headers } from "next/headers"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getOrgBySlug } from "@/lib/ap/store"
import { apDict } from "@/lib/ap/i18n"
import { pageLang } from "@/lib/ap/page-lang"
import { externalIdFromQuery } from "@/lib/ap/validate"
import { ApAccessForm } from "@/components/ap-access-form"

// /ap/{org}/join — the org's agent sign-up link. ?{agentIdParam}=<ID>
// prefills the Agent ID (signs no one in, skips no step); ?ref=<code> is a
// recruiter's link (counted only for an active agent of this org).
export const dynamic = "force-dynamic"

export default async function JoinPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const org = await getOrgBySlug((await params).org)
  if (!org || org.status === "paused") notFound()
  const sp = await searchParams
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])))
  const lang = pageLang(org, query.get("lang") ?? undefined, (await headers()).get("accept-language"))
  const t = apDict(lang, { org: org.name })
  const ref = query.get("ref")
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">{t["join.title"]}</h1>
      <p className="mt-2 mb-6 text-muted-foreground">{t["join.intro"]}</p>
      <ApAccessForm mode="join" slug={org.slug} lang={lang} languages={org.languages} t={t} prefillId={externalIdFromQuery(query, org.agentIdParam)} refCode={ref && /^[A-Za-z0-9]{7}$/.test(ref) ? ref : null} />
      <p className="mt-6 text-sm"><Link className="underline" href={`/ap/${org.slug}/sign-in?lang=${lang}`}>{t["have_account"]}</Link></p>
    </main>
  )
}
