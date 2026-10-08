import { describe, it, expect } from "vitest"
import { codeMatches, hashCode, newCode, newFlowId } from "@/lib/enterprise/access-store"

describe("access codes", () => {
  it("are 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/)
  })
  it("flow ids are long and random", () => {
    const a = newFlowId(), b = newFlowId()
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(a).not.toBe(b)
  })
  it("match only the right code for the right flow", () => {
    const flow = newFlowId()
    const stored = hashCode(flow, "042917")
    expect(codeMatches(flow, "042917", stored)).toBe(true)
    expect(codeMatches(flow, "042918", stored)).toBe(false)
    expect(codeMatches(newFlowId(), "042917", stored)).toBe(false)
  })
  it("never match once used (hash cleared) or for a neutral flow", () => {
    expect(codeMatches(newFlowId(), "123456", null)).toBe(false)
  })
  it("reject anything that isn't exactly 6 digits", () => {
    const flow = newFlowId()
    const stored = hashCode(flow, "123456")
    for (const bad of ["12345", "1234567", "12345a", "", " 123456"]) expect(codeMatches(flow, bad, stored)).toBe(false)
  })
  it("store only a hash, never the code", () => {
    const flow = newFlowId()
    expect(hashCode(flow, "123456")).toMatch(/^[0-9a-f]{64}$/)
    expect(hashCode(flow, "123456")).not.toContain("123456")
  })
})
