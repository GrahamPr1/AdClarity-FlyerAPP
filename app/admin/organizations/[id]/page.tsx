import { notFound } from "next/navigation"
import { getOrg, listOrgAgents, listOrgLog } from "@/lib/ap/store"
import { signupLink } from "@/lib/ap/links"
import { ApOrgDetail } from "@/components/ap-org-detail"

// /admin/organizations/{id} — config, status, files, agents and log for one org.
export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const org = await getOrg((await params).id)
  if (!org) notFound()
  const [agents, log] = await Promise.all([listOrgAgents(org.id), listOrgLog(org.id)])
  return <ApOrgDetail initialOrg={org} initialAgents={agents} log={log} signupLink={signupLink(org)} />
}
