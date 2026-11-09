import { Redis } from "@upstash/redis"
import { AGENT_ID_RE, NOP_QR_ALPHABET, NOP_QR_CODE_LENGTH, NOP_QR_CODE_RE } from "./nop-roster"

// The short code in a NOP agent's QR link (oneflyer.org/a/{code}).
//
//   nop-qr-code:{code}          -> {"agentId": "..."}
//   nop-agent:{agentId}:qr-code -> {"code": "..."}
//
// Stored as small JSON objects, never bare strings: the Redis client parses
// values as JSON on read, so a bare "23E4567" would come back as Infinity.
//
// One code per Agent ID, issued the first time a flyer needs it, and never
// changed or reissued: both keys are written once, together, and nothing
// deletes or overwrites them (not an account change, not an admin data move,
// not a roster status change). The code belongs to the Agent ID, so it
// follows the ID to whichever account holds it.

const redis = Redis.fromEnv()

const codeKey = (code: string) => `nop-qr-code:${code}`
const agentCodeKey = (agentId: string) => `nop-agent:${agentId}:qr-code`

/** A uniformly random code. Rejection sampling, so no character is likelier than another. */
export function randomQrCode(length = NOP_QR_CODE_LENGTH): string {
  const n = NOP_QR_ALPHABET.length
  const limit = 256 - (256 % n)
  let out = ""
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += NOP_QR_ALPHABET[b % n]
    }
  }
  return out
}

// KEYS: agent's code key, candidate code key. ARGV: {"code"} JSON, {"agentId"} JSON.
// The agent's existing code wins; a candidate already taken by anyone is "taken".
const ISSUE = `
local existing = redis.call("GET", KEYS[1])
if existing then return existing end
if redis.call("EXISTS", KEYS[2]) == 1 then return "taken" end
redis.call("SET", KEYS[2], ARGV[2])
redis.call("SET", KEYS[1], ARGV[1])
return ARGV[1]`

/** The Agent ID's code, issuing it now if it has none. */
export async function getOrIssueAgentQrCode(agentId: string): Promise<string> {
  if (!AGENT_ID_RE.test(agentId)) throw new Error(`not an Agent ID: ${agentId}`)
  const existing = await getAgentQrCode(agentId)
  if (existing) return existing
  for (let i = 0; i < 8; i++) {
    const candidate = randomQrCode()
    const out = await redis.eval<string[], unknown>(ISSUE, [agentCodeKey(agentId), codeKey(candidate)], [JSON.stringify({ code: candidate }), JSON.stringify({ agentId })])
    if (out === "taken") continue
    const code = field(out, "code")
    if (code) return code
  }
  throw new Error(`couldn't issue a QR code for ${agentId}`)
}

/** The Agent ID's code, or null if none has been issued yet. Never issues one. */
export async function getAgentQrCode(agentId: string): Promise<string | null> {
  return field(await redis.get(agentCodeKey(agentId)), "code")
}

/** The Agent ID a code was issued to, or null for anything unknown or malformed. */
export async function agentIdForQrCode(code: string): Promise<string | null> {
  if (!NOP_QR_CODE_RE.test(code)) return null
  return field(await redis.get(codeKey(code)), "agentId")
}

/** One string field of a stored {..} value, whether the client returned it parsed or as JSON text. */
function field(v: unknown, name: "code" | "agentId"): string | null {
  let o = v
  if (typeof o === "string") {
    try { o = JSON.parse(o) } catch { return null }
  }
  const out = o && typeof o === "object" ? (o as Record<string, unknown>)[name] : null
  return typeof out === "string" && out ? out : null
}
