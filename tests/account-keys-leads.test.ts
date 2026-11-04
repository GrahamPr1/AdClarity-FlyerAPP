import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Account deletion (collectAccountKeys, used by the admin audit delete) must
 * take an account's leads with it: the lead records, the client's lead index,
 * and each flyer's lead index and channel-code set. Another account's keys,
 * including another flyer's leads, must not be touched.
 */

const kv = vi.hoisted(() => new Map<string, unknown>())
vi.mock("@upstash/redis", () => {
  const glob = (pattern: string) => new RegExp("^" + pattern.replace(/\\(.)/g, "$1").replace(/[.+?^${}()|[\]]/g, "\\$&").replace(/\*/g, ".*") + "$")
  const fake = {
    scan: async (_cursor: string, { match }: { match: string }) => ["0", [...kv.keys()].filter((k) => glob(match).test(k))],
    get: async (key: string) => kv.get(key) ?? null,
  }
  return { Redis: { fromEnv: () => fake } }
})

const ME = "owner@example.test"
const OTHER = "someone-else@example.test"

beforeEach(() => {
  kv.clear()
  const records: [string, string, string][] = [["ABC2345", ME, "flyer-1"], ["CHN2345", ME, "flyer-1"], ["XYZ6789", OTHER, "flyer-9"]]
  for (const [code, email, flyerId] of records) kv.set(`tracking:${code}:record`, { email, flyerId })
  for (const k of [
    `client:${ME}:plan`, `client:${ME}:lead:L1`, `client:${ME}:lead:L2`, `client:${ME}:leads`,
    "flyer:flyer-1:leads", "flyer:flyer-1:channel-codes",
    `client:${OTHER}:plan`, `client:${OTHER}:lead:L9`, `client:${OTHER}:leads`, "flyer:flyer-9:leads", "flyer:flyer-9:channel-codes",
  ]) kv.set(k, 1)
})

describe("collectAccountKeys", () => {
  it("covers the account's leads, lead indexes and channel-code sets", async () => {
    const { collectAccountKeys } = await import("@/lib/store")
    const { keys } = await collectAccountKeys(ME)
    for (const k of [`client:${ME}:lead:L1`, `client:${ME}:lead:L2`, `client:${ME}:leads`, "flyer:flyer-1:leads", "flyer:flyer-1:channel-codes"]) {
      expect(keys).toContain(k)
    }
  })

  it("leaves every other account's keys alone", async () => {
    const { collectAccountKeys } = await import("@/lib/store")
    const { keys } = await collectAccountKeys(ME)
    expect(keys.filter((k) => k.includes(OTHER) || k.includes("flyer-9") || k.includes("XYZ6789"))).toEqual([])
  })
})
