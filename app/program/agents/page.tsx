import { cookies } from "next/headers"
import { nopAdminFrom } from "@/lib/enterprise/program-admins"
import { NopAgentsAdmin } from "@/components/nop-agents-admin"

export default async function Page() {
  const who = await nopAdminFrom({ cookies: await cookies() })
  return <NopAgentsAdmin base="/program/agents" role={who?.role ?? "program"} />
}
