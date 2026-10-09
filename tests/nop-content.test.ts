import { describe, it, expect } from "vitest"
import { bundledContent, validateContentUpload, type LiveContent } from "@/lib/enterprise/nop-render/content-store"
import { readKitContent, type KitContent } from "@/lib/enterprise/nop-render/kit"

const live = bundledContent()
const base = () => JSON.parse(JSON.stringify(readKitContent())) as KitContent & { _note: string }
const check = (c: unknown, against: LiveContent = live, history: { version: string; content: KitContent }[] = []) =>
  validateContentUpload(typeof c === "string" ? c : JSON.stringify(c), against, history)
const asLive = (c: KitContent, version = "c1"): LiveContent => ({ version, content: c, sha: "x" })

describe("content.json uploads", () => {
  it("accept a price change with a later effective month, and report the stamp change", () => {
    const c = base()
    c.prices.P1.single = "$24.00"
    c.program.effective_date = "2026-11-01"
    const r = check(c)
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.changes).toEqual(["P1.single: $22.50 → $24.00", "effective_date: 2026-10-05 → 2026-11-01", "printed version stamp: NOP-P1-EN v1.1.1 10/2026 → NOP-P1-EN v1.1.1 11/2026"])
  })
  it("reject a price change without a later effective month (the printed stamp would not change)", () => {
    const c = base()
    c.prices.P2.family = "$110.00"
    for (const date of ["2026-10-05", "2026-10-31"]) {
      c.program.effective_date = date
      const r = check(c)
      expect(r.ok).toBe(false)
      expect(r.errors.join(" ")).toMatch(/later month than the live 2026-10-05/)
    }
  })
  it("reject an effective date that moves backwards", () => {
    const c = base()
    c.program.effective_date = "2026-09-30"
    expect(check(c).errors.join(" ")).toMatch(/earlier than the live/)
  })
  it("accept a note-only or date-only change", () => {
    const n = base(); n._note = "Updated note"
    expect(check(n).ok).toBe(true)
    const d = base(); d.program.effective_date = "2026-12-01"
    expect(check(d).ok).toBe(true)
  })
  it("reject an upload identical to live", () => {
    expect(check(base()).errors).toContain("This is identical to the live version; nothing to publish.")
  })
  it.each(["$22.5", "22.50", "$1,000.00", "$ 22.50", "$22.500", "", "$-1.00", "$022.50", "$10000.00"])("reject the price %j", (price) => {
    const c = base()
    c.prices.P3.single = price
    c.program.effective_date = "2026-11-01"
    const r = check(c)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/prices\.P3\.single/)
  })
  it("accept up to $9999.99, the widest that fits every price box", () => {
    const c = base(); c.prices.P3.family = "$9999.99"; c.program.effective_date = "2026-11-01"
    expect(check(c).ok).toBe(true)
  })
  it("reject $0.00", () => {
    const c = base(); c.prices.P1.family = "$0.00"; c.program.effective_date = "2026-11-01"
    expect(check(c).errors.join(" ")).toMatch(/more than \$0\.00/)
  })
  it("reject a price that isn't text", () => {
    const c = base() as unknown as { prices: { P1: { single: unknown } } }
    c.prices.P1.single = 22.5
    expect(check(c).errors.join(" ")).toMatch(/prices\.P1\.single must be text/)
  })
  it.each([
    ["enroll_domain", (c: Record<string, unknown>) => { c.enroll_domain = "join.basicbenefits.com/" }],
    ["program.kit_version", (c: Record<string, unknown>) => { (c.program as Record<string, unknown>).kit_version = "1.2.0" }],
    ["version_stamp_format", (c: Record<string, unknown>) => { c.version_stamp_format = "{MM}/{YYYY}" }],
    ["template_price_fields.NOP_P1_EN.price_single", (c: Record<string, unknown>) => { (c.template_price_fields as Record<string, Record<string, string>>).NOP_P1_EN.price_single = "P2.single" }],
    ["default_logo", (c: Record<string, unknown>) => { c.default_logo = "assets/x.png" }],
  ])("reject a change to the locked field %s (a code change)", (field, mutate) => {
    const c = base() as unknown as Record<string, unknown>
    mutate(c)
    const r = check(c)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toContain(`${field} can't be changed here`)
  })
  it("reject missing and unknown fields, including a new or missing price", () => {
    const missing = base() as unknown as Record<string, unknown>
    delete missing.enroll_domain
    expect(check(missing).errors).toContain("enroll_domain is missing")
    const extra = base() as unknown as Record<string, unknown>
    extra.discount = "10%"
    expect(check(extra).errors).toContain("discount is not a field of content.json")
    const newPrice = base() as unknown as { prices: Record<string, Record<string, string>> }
    newPrice.prices.P4 = { single: "$1.00", family: "$2.00" }
    expect(check(newPrice).errors).toContain("prices.P4 is not a field of content.json")
    const noFamily = base() as unknown as { prices: Record<string, Record<string, string>> }
    delete noFamily.prices.P2.family
    expect(check(noFamily).errors).toContain("prices.P2.family is missing")
  })
  it("reject an invalid effective date", () => {
    for (const d of ["2026-02-30", "2026-13-01", "11/01/2026", ""]) {
      const c = base(); c.program.effective_date = d
      expect(check(c).errors.join(" ")).toMatch(/real date as YYYY-MM-DD/)
    }
  })
  it("reject non-JSON and non-objects", () => {
    expect(check("{nope").errors[0]).toMatch(/Not valid JSON/)
    expect(check("[]").errors[0]).toMatch(/must be a JSON object/)
  })
  it("reject reusing a month stamp that an earlier version printed with different prices", () => {
    // c1 published 2026-11 with new prices, then rolled back to bundled (2026-10).
    const c1 = base(); c1.prices.P1.single = "$24.00"; c1.program.effective_date = "2026-11-01"
    const c3 = base(); c3.prices.P1.single = "$25.00"; c3.program.effective_date = "2026-11-15"
    const r = check(c3, live, [{ version: "c1", content: c1 }])
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/Version c1 already printed the stamp NOP-P1-EN v1.1.1 11\/2026/)
    // Re-publishing c1's own prices under its month is fine (same stamp, same prices).
    const same = base(); same.prices.P1.single = "$24.00"; same.program.effective_date = "2026-11-20"
    expect(check(same, live, [{ version: "c1", content: c1 }]).ok).toBe(true)
  })
  it("compare against the LIVE version, not the bundled one", () => {
    const c1 = base(); c1.prices.P1.single = "$24.00"; c1.program.effective_date = "2026-11-01"
    const next = base(); next.prices.P1.single = "$24.00"; next.program.effective_date = "2026-11-01"; next._note = "x"
    expect(check(next, asLive(c1)).ok).toBe(true)
    next.prices.P1.single = "$26.00"
    expect(check(next, asLive(c1)).errors.join(" ")).toMatch(/later month than the live 2026-11-01/)
  })
})
