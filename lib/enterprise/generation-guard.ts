import { NextResponse } from "next/server"
import { isNopAgentAccount } from "./agents-store"

export const NOP_GENERATION_BLOCKED_MESSAGE = "NOP flyers are generated from approved templates — coming soon"

/**
 * Keeps NOP agents off free-form AI generation, whatever their roster status.
 * An agent publishing their own claims about the program is the risk, not
 * plan usage, so this is a different check from canGenerate. Returns null for
 * every account that holds no Agent ID — the SMB path is unaffected.
 */
export async function nopAgentGenerationBlock(email: string): Promise<NextResponse | null> {
  if (!(await isNopAgentAccount(email))) return null
  return NextResponse.json({ error: "nop_agent_blocked", message: NOP_GENERATION_BLOCKED_MESSAGE }, { status: 403 })
}
