import { NextResponse } from "next/server"

// The agent platform (lib/ap, /ap, /admin/organizations) exists only where
// AGENT_PLATFORM_ENABLED is exactly "true" — set on Preview (agent-platform)
// and nowhere else. Every page and route checks this first, so with the flag
// unset every new path is an ordinary 404 and touches no storage at all.

export function agentPlatformEnabled(): boolean {
  return process.env.AGENT_PLATFORM_ENABLED?.trim() === "true"
}

/** The 404 every new route returns while the platform is off. No body, no hint it exists. */
export function apOff(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } })
}
