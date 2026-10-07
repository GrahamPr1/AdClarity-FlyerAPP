import { NextResponse, type NextRequest } from "next/server"
import { isNopAgentAccount } from "./agents-store"
import { tNop } from "./nop-i18n"
import { nopLangForRequest } from "./nop-i18n/server"

/**
 * Keeps NOP agents off free-form AI generation, whatever their roster status.
 * An agent publishing their own claims about the program is the risk, not
 * plan usage, so this is a different check from canGenerate. Returns null for
 * every account that holds no Agent ID — the SMB path is unaffected.
 *
 * The message is in the agent's language (nop_lang cookie, saved preference,
 * then the browser), since it is the one NOP string shown outside NOP pages.
 */
export async function nopAgentGenerationBlock(email: string, request: NextRequest): Promise<NextResponse | null> {
  if (!(await isNopAgentAccount(email))) return null
  const lang = await nopLangForRequest(request, email)
  return NextResponse.json({ error: "nop_agent_blocked", message: tNop(lang, "gen.blocked") }, { status: 403 })
}
