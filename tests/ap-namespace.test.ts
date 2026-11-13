import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// Static checks over every agent-platform source file: the namespace and the
// NOP freeze (NOP_FROZEN.md) hold by construction, not by convention.

const ROOT = process.cwd()
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}
const AP_FILES = [
  ...walk(path.join(ROOT, "lib/ap")),
  ...walk(path.join(ROOT, "app/ap")),
  ...walk(path.join(ROOT, "app/api/ap")),
  ...walk(path.join(ROOT, "app/admin/organizations")),
  ...walk(path.join(ROOT, "app/api/admin/organizations")),
  ...fs.readdirSync(path.join(ROOT, "components")).filter((f) => f.startsWith("ap-")).map((f) => path.join(ROOT, "components", f)),
].filter((f) => /\.(ts|tsx)$/.test(f))
const src = (f: string) => fs.readFileSync(f, "utf8")
const rel = (f: string) => path.relative(ROOT, f)

describe("agent platform namespace", () => {
  it("finds the platform's files", () => {
    expect(AP_FILES.length).toBeGreaterThan(20)
  })

  it("never imports NOP or enterprise code", () => {
    for (const f of AP_FILES) {
      const imports = [...src(f).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
      for (const i of imports) expect(`${rel(f)} imports ${i}`).not.toMatch(/imports .*(lib\/enterprise|\/nop|nop-|program-admin|agent-session)/)
    }
  })

  it("only lib/ap/store.ts and lib/ap/access.ts talk to Redis", () => {
    const users = AP_FILES.filter((f) => /@upstash\/redis/.test(src(f))).map(rel).sort()
    expect(users).toEqual(["lib/ap/access.ts", "lib/ap/store.ts"])
  })

  it("every Redis key those files build starts with ap:", () => {
    const keyLike = /["'`]([a-z][a-z0-9_-]*):[^"'`\s]*["'`]/g
    for (const f of ["lib/ap/store.ts", "lib/ap/access.ts"]) {
      const found = [...src(path.join(ROOT, f)).matchAll(keyLike)].map((m) => m[0])
      expect(found.length).toBeGreaterThanOrEqual(2)
      for (const k of found.filter((k) => !/^["'`]node:/.test(k))) expect(`${f}: ${k}`).toMatch(/: ["'`]ap:/)
    }
  })

  it("names no NOP Redis prefix or Blob path anywhere", () => {
    const NOP = /["'`](nop-|nop:|agent-account:|agent-id:|agent-flags:|agent-billing:|agent-stripe-event:|program-admins?:|roster:|enterprise-org:|admin-agent-views|print-requests:|sms:|client:)/
    for (const f of AP_FILES) expect(`${rel(f)}: ${src(f).match(NOP)?.[0] ?? ""}`).toBe(`${rel(f)}: `)
  })

  it("writes Blob only under ap/", () => {
    const blob = src(path.join(ROOT, "lib/ap/blob.ts"))
    expect(blob).toContain('AP_BLOB_ROOT = "ap/"')
    for (const f of AP_FILES.filter((f) => !f.endsWith("lib/ap/blob.ts"))) {
      expect(`${rel(f)} ${/@vercel\/blob/.test(src(f))}`).toBe(`${rel(f)} false`)
    }
  })

  it("never uses the 'agent' route or key prefix of its own", () => {
    for (const f of AP_FILES) expect(`${rel(f)}: ${/["'`]\/agent[/"'`?]/.test(src(f))}`).toBe(`${rel(f)}: false`)
  })
})
