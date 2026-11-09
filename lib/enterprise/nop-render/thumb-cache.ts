import { Redis } from "@upstash/redis"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { KIT_DIR, readKitContent, type NopTemplateId } from "./kit"
import { isNopV2Template, readV2Html, type NopV2Id } from "./kit-v2"
import type { NopAgentValues } from "./render"

// Dashboard thumbnails, cached for 7 days. The key is a hash of EVERY
// input — template, kit version, content.json (so prices), the master
// HTML, the default logo, the agent's Agent ID and display fields, and a
// renderer version — so a changed price, profile or master can never serve
// a stale image; it simply misses and renders fresh. Not permanent: the
// TTL bounds storage, and nothing here is a record (the generation log is).

const redis = Redis.fromEnv()
export const THUMB_TTL_SECONDS = 7 * 24 * 60 * 60
/** Bump when the renderer's output for the same inputs changes. */
const RENDERER_VERSION = "thumb-2"
/** The same, for kit v2 (agent area in the footer). */
const RENDERER_VERSION_V2 = "thumb-v2-1"

const fileHash = (rel: string) => createHash("sha256").update(fs.readFileSync(path.join(KIT_DIR, rel))).digest("hex")

/** `domain`: the enrollment domain setting, printed on the flyer, so a change can't serve an old address. */
export function thumbCacheKey(id: NopTemplateId | NopV2Id, agent: NopAgentValues, domain: string): string {
  const content = readKitContent()
  const h = createHash("sha256")
  // Kit v2 prints the enrollment domain from content.json and the page from its own HTML.
  const kitParts = isNopV2Template(id)
    ? [RENDERER_VERSION_V2, id, fileHash("content.json"), createHash("sha256").update(readV2Html(id, "letter")).digest("hex")]
    : [RENDERER_VERSION, id, content.program.kit_version, fileHash("content.json"), fileHash(`html/${id}.html`), fileHash(content.default_logo)]
  for (const part of [...kitParts, domain, agent.agentId, agent.displayName, agent.displayPhone, agent.displayEmail]) h.update(part).update("\u0000")
  return `nop-thumb:${h.digest("hex")}`
}

export async function getCachedThumb(key: string): Promise<Buffer | null> {
  const b64 = await redis.get<string>(key)
  return b64 ? Buffer.from(b64, "base64") : null
}

export async function setCachedThumb(key: string, jpeg: Buffer): Promise<void> {
  await redis.set(key, jpeg.toString("base64"), { ex: THUMB_TTL_SECONDS })
}
