import { NextResponse, type NextRequest } from "next/server"
import { canUse, type AgentFeature } from "./features"
import { loadPortalContext, type PortalContext } from "./context"
import { requirePortalViewer, type PortalViewer } from "./view-as"

/**
 * For a tier-gated agent API route: the viewer and their portal context, or
 * the response to return. A feature the agent can't use (tier too low, or
 * switched off for their org) is a 403 carrying no data at all, so a Basic
 * agent gets nothing back, not an empty-looking answer.
 */
export async function requireAgentFeature(
  request: NextRequest,
  feature: AgentFeature | null,
): Promise<{ viewer: PortalViewer; ctx: PortalContext } | { response: NextResponse }> {
  const viewer = await requirePortalViewer(request)
  if ("response" in viewer) return viewer
  const ctx = await loadPortalContext(viewer.email)
  if (!ctx) return { response: NextResponse.json({ error: "not_an_agent" }, { status: 404 }) }
  if (feature && !canUse(ctx, feature)) return { response: NextResponse.json({ error: "not_available", feature }, { status: 403 }) }
  return { viewer, ctx }
}
