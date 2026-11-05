import { Redis } from "@upstash/redis"
import { isNopV2Template, v2Parts } from "./kit-v2"

// Which NOP flyers agents get, set by OneFlyer admin only.
//
//   nop-flyers:settings   hash
//     agentKit     "v1" | "v2"   which kit fills Create (unset = v1, Basic Benefits' kit v1.1.1)
//     spanishV2    "on" | "off"  whether agents may see kit-v2 Spanish flyers (unset = off; pending review)
//
// Kit v2 can't be given to agents until its agent information area exists
// (AGENT_AREA_READY): Basic Benefits are still choosing where it goes. Until
// then every agent route refuses every v2 flyer, whatever the settings say.

const redis = Redis.fromEnv()
const KEY = "nop-flyers:settings"

/** Flipped when the agent area (name, phone, QR, enrollment link) is built and approved. */
export const AGENT_AREA_READY = false

export interface NopFlyerSettings {
  agentKit: "v1" | "v2"
  spanishV2: boolean
}

export async function getNopFlyerSettings(): Promise<NopFlyerSettings> {
  const s = (await redis.hgetall<Record<string, string>>(KEY)) ?? {}
  return { agentKit: s.agentKit === "v2" ? "v2" : "v1", spanishV2: s.spanishV2 === "on" }
}

export async function setNopFlyerSetting(patch: Partial<NopFlyerSettings>): Promise<NopFlyerSettings> {
  const out: Record<string, string> = {}
  if (patch.agentKit) out.agentKit = patch.agentKit
  if (patch.spanishV2 !== undefined) out.spanishV2 = patch.spanishV2 ? "on" : "off"
  if (Object.keys(out).length) await redis.hset(KEY, out)
  return getNopFlyerSettings()
}

/**
 * Whether an AGENT may see or download this template. One rule for every
 * agent route: kit v1.1.1 templates only while agents are on v1; kit-v2 ones
 * only once the agent area exists AND agents are on v2, and Spanish v2 only
 * with the Spanish switch on. Admin previews don't go through this.
 */
export function agentMaySeeTemplate(template: string, settings: NopFlyerSettings, isV1Template: boolean): boolean {
  if (isV1Template) return settings.agentKit === "v1"
  if (!isNopV2Template(template)) return false
  if (!AGENT_AREA_READY || settings.agentKit !== "v2") return false
  return v2Parts(template).lang === "EN" || settings.spanishV2
}
