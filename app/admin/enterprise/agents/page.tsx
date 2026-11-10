import { NopAgentsAdmin } from "@/components/nop-agents-admin"

// /admin/enterprise/agents: the owner's NOP agents screen (app/admin/layout.tsx gates it).
// Program admins use the same screen at /program/agents.
export default function Page() {
  return <NopAgentsAdmin base="/admin/enterprise/agents" role="owner" />
}
