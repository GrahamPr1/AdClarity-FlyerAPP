import { NopAgentDetailAdmin } from "@/components/nop-agent-detail-admin"

// /admin/enterprise/agents/{email}: one agent's account. Opening it is logged.
export default function Page() {
  return <NopAgentDetailAdmin base="/admin/enterprise/agents" />
}
