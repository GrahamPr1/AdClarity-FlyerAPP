import { loadEnterpriseDemoData, DEMO_AGENT_EMAIL } from "./data"
import EnterpriseDemoClient from "./demo-client"

/**
 * Internal enterprise demo — unlisted.
 *
 * Lives under /admin/* so it inherits both existing gates: the middleware
 * session check and app/admin/layout.tsx's fresh isAdminSession lookup.
 * Nothing links to it and it is not in the admin nav. A hand-rolled gate
 * under /internal would have been a second piece of auth to get right, and
 * this needs no new auth code at all.
 */
export const dynamic = "force-dynamic"

export default async function EnterpriseDemoPage() {
  const initial = await loadEnterpriseDemoData(DEMO_AGENT_EMAIL)
  return <EnterpriseDemoClient email={DEMO_AGENT_EMAIL} initial={initial} />
}
