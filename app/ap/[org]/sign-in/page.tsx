import { headers } from "next/headers"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getOrgBySlug } from "@/lib/ap/store"
import { apDict } from "@/lib/ap/i18n"
import { pageLang } from "@/lib/ap/page-lang"
import { ApAccessForm } from "@/components/ap-access-form"

// /ap/{org}/sign-in — emailed-code sign-in for this org's active agents.
export const dynamic = "force-dynamic"

export default async function SignInPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<{ lang?: string }> }) {
  const org = await getOrgBySlug((await params).org)
  if (!org) notFound()
  const lang = pageLang(org, (await searchParams).lang, (await headers()).get("accept-language"))
  const t = apDict(lang, { org: org.name })
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">{t["signin.title"]}</h1>
      <ApAccessForm mode="signin" slug={org.slug} lang={lang} languages={org.languages} t={t} prefillId={null} refCode={null} />
      <p className="mt-6 text-sm"><Link className="underline" href={`/ap/${org.slug}/join?lang=${lang}`}>{t["need_account"]}</Link></p>
    </main>
  )
}
