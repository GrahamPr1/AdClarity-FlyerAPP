import { NextRequest, NextResponse } from "next/server"
import { getSessionIdentity, ADMIN_SUB } from "@/lib/auth"
import { parseMarketingGoal, GoalTooVagueError } from "@/lib/agent-pipeline/goal-parser"
import { AgentRefusalError } from "@/lib/agent-pipeline/client"

// POST /api/goal-parser — plain-language business goal in, structured
// marketing objective out. Nothing else: it creates no campaign, no flyer and
// no record, and no UI calls it. A backend capability with a test surface,
// not a feature.
//
// Auth is the same session check every other client route uses, and the
// business context is read from session.sub. There is deliberately no `email`
// parameter, so there is nothing here for one client to point at another's
// saved profile.
//
// ADMIN_SUB is excluded for the same reason /api/campaign-defaults excludes
// it: the site-owner login has no business of its own to describe.

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const session = await getSessionIdentity(request)
  if (!session || session.sub === ADMIN_SUB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { goal?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body.goal !== "string" || !body.goal.trim()) {
    return NextResponse.json({ error: "Missing required field: goal" }, { status: 422 })
  }

  try {
    const { parsed, usedBusinessContext } = await parseMarketingGoal({ goal: body.goal, email: session.sub })
    return NextResponse.json({ ok: true, usedBusinessContext, ...parsed })
  } catch (err) {
    if (err instanceof GoalTooVagueError) {
      return NextResponse.json({ error: "goal_too_vague", message: err.message }, { status: 422 })
    }
    // The model declined the input (see AgentRefusalError in client.ts) —
    // a client-side problem with what was typed, not a server fault.
    if (err instanceof AgentRefusalError) {
      return NextResponse.json(
        { error: "goal_rejected", message: "We couldn't read that as a business goal — try describing what you want to achieve." },
        { status: 422 },
      )
    }
    console.error("[goal-parser] Failed to parse goal:", err)
    return NextResponse.json({ error: "parse_failed", message: "We couldn't work that out just now — please try again in a moment." }, { status: 500 })
  }
}
