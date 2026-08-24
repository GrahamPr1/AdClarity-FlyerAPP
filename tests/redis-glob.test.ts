import { describe, it, expect } from "vitest"
import { escapeRedisGlob } from "@/lib/redis-glob"

/**
 * This guards a DELETE path. SCAN MATCH is a glob, so an unescaped id
 * containing glob syntax widens the pattern and sweeps in other accounts'
 * keys — deleting data belonging to someone else.
 */
describe("escapeRedisGlob", () => {
  it("leaves an ordinary email untouched", () => {
    expect(escapeRedisGlob("sarah@millerheating.com")).toBe("sarah@millerheating.com")
  })

  it("escapes a character class, which would otherwise match other accounts", () => {
    // Unescaped, `client:a[bc]@x.com:*` also matches ab@x.com and ac@x.com.
    expect(escapeRedisGlob("a[bc]@x.com")).toBe("a\\[bc\\]@x.com")
  })

  it("escapes wildcards", () => {
    expect(escapeRedisGlob("*@x.com")).toBe("\\*@x.com")
    expect(escapeRedisGlob("a?@x.com")).toBe("a\\?@x.com")
  })

  it("escapes backslash and caret", () => {
    expect(escapeRedisGlob("a\\b")).toBe("a\\\\b")
    expect(escapeRedisGlob("[^a]")).toBe("\\[\\^a\\]")
  })

  it("handles the malformed ids that really exist in this database", () => {
    // Two flagged production records had bare strings, not addresses.
    expect(escapeRedisGlob("test")).toBe("test")
    expect(escapeRedisGlob("bxhsvsh")).toBe("bxhsvsh")
  })
})
