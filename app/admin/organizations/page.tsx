import { listOrgs } from "@/lib/ap/store"
import { ApOrgsList } from "@/components/ap-orgs-list"

// /admin/organizations — every client org (gated by ./layout.tsx).
export const dynamic = "force-dynamic"

export default async function Page() {
  return <ApOrgsList orgs={await listOrgs()} />
}
