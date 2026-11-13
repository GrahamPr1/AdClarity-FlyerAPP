// An in-memory stand-in for @upstash/redis, enough for lib/ap. Understands the
// two Lua scripts lib/ap/store.ts sends (agent creation, code issuance) by
// their text, and records every key touched so tests can assert the namespace.

export function makeFakeRedis() {
  const kv = new Map<string, unknown>()
  const sets = new Map<string, Set<string>>()
  const zsets = new Map<string, Map<string, number>>()
  const lists = new Map<string, unknown[]>()
  const touched = new Set<string>()
  const t = (k: string) => (touched.add(k), k)
  const parse = (v: unknown) => {
    if (typeof v !== "string") return v
    try { return JSON.parse(v) } catch { return v }
  }
  const exists = (k: string) => kv.has(k) || sets.has(k) || zsets.has(k) || lists.has(k)
  const fake = {
    get: async (k: string) => (kv.has(t(k)) ? parse(kv.get(k)) : null),
    set: async (k: string, v: unknown, o?: { nx?: boolean; ex?: number }) => {
      if (o?.nx && kv.has(t(k))) return null
      kv.set(t(k), v)
      return "OK"
    },
    del: async (k: string) => (kv.delete(t(k)) ? 1 : 0),
    exists: async (k: string) => (exists(t(k)) ? 1 : 0),
    incr: async (k: string) => { const n = Number(kv.get(t(k)) ?? 0) + 1; kv.set(k, n); return n },
    expire: async (k: string) => (t(k), 1),
    ttl: async (k: string) => (t(k), 600),
    sadd: async (k: string, v: string) => { const s = sets.get(t(k)) ?? new Set(); s.add(v); sets.set(k, s); return 1 },
    smembers: async (k: string) => [...(sets.get(t(k)) ?? [])],
    zadd: async (k: string, o: { score: number; member: string }) => { const z = zsets.get(t(k)) ?? new Map(); z.set(o.member, o.score); zsets.set(k, z); return 1 },
    zrange: async (k: string) => [...(zsets.get(t(k)) ?? new Map()).entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m),
    lpush: async (k: string, v: unknown) => { lists.set(t(k), [v, ...(lists.get(k) ?? [])]); return 1 },
    ltrim: async (k: string, a: number, b: number) => { lists.set(t(k), (lists.get(k) ?? []).slice(a, b + 1)); return "OK" },
    lrange: async (k: string, a: number, b: number) => (lists.get(t(k)) ?? []).slice(a, b === -1 ? undefined : b + 1).map(parse),
    eval: async (script: string, keys: string[], args: string[]) => {
      keys.forEach(t)
      if (script.includes("ext_taken")) {
        if (kv.has(keys[0])) return "ext_taken"
        if (kv.has(keys[1])) return "email_taken"
        kv.set(keys[0], args[0]); kv.set(keys[1], args[0]); kv.set(keys[2], args[1])
        const z = zsets.get(keys[3]) ?? new Map(); z.set(args[3], Number(args[2])); zsets.set(keys[3], z)
        return "ok"
      }
      if (script.includes('return "taken"')) {
        if (kv.has(keys[0])) return parse(kv.get(keys[0]))
        if (kv.has(keys[1])) return "taken"
        kv.set(keys[1], args[1]); kv.set(keys[0], args[0])
        return parse(args[0])
      }
      throw new Error("unknown script")
    },
  }
  return { fake, kv, touched, reset: () => { kv.clear(); sets.clear(); zsets.clear(); lists.clear(); touched.clear() } }
}
