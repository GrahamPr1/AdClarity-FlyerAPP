import { describe, it, expect } from "vitest"
import { signalsForClient, verdictFor, findBursts, auditClients, type AuditableClient } from "@/lib/audit-test-data"

const real = (over: Partial<AuditableClient> = {}): AuditableClient => ({
  email: "sarah@millerheating.com",
  businessName: "Miller Heating & Air",
  createdAt: "2026-08-01T14:22:00.000Z",
  plan: "basic",
  flyersCreated: 4,
  lifetimeFlyersCreated: 12,
  hasPassword: true,
  ...over,
})

const codes = (c: AuditableClient) => signalsForClient(c).map((s) => s.code)

describe("catching test data", () => {
  it("flags reserved documentation domains", () => {
    expect(codes(real({ email: "a@example.com" }))).toContain("reserved-domain")
  })

  it("flags reserved TLDs that cannot resolve", () => {
    expect(codes(real({ email: "someone@oneflyer.invalid" }))).toContain("reserved-tld")
    expect(codes(real({ email: "someone@foo.test" }))).toContain("reserved-tld")
  })

  it("flags throwaway tokens in the address", () => {
    expect(codes(real({ email: "test@gmail.com" }))).toContain("test-token-in-address")
    expect(codes(real({ email: "john.test@gmail.com" }))).toContain("test-token-in-address")
    expect(codes(real({ email: "qa+3@company.com" }))).toContain("test-token-in-address")
  })

  it("flags keyboard mashing", () => {
    expect(codes(real({ email: "asdfgh@gmail.com" }))).toContain("mashed-address")
    expect(codes(real({ email: "aaaaa@gmail.com" }))).toContain("mashed-address")
    expect(codes(real({ businessName: "asdfasdf" }))).toContain("mashed-business-name")
  })

  it("flags placeholder business names", () => {
    expect(codes(real({ businessName: "Test Business" }))).toContain("placeholder-business-name")
    expect(codes(real({ businessName: "Acme Inc" }))).toContain("placeholder-business-name")
  })
})

describe("not smearing real customers", () => {
  it("leaves an ordinary paying customer alone", () => {
    expect(verdictFor(signalsForClient(real()))).toBe("looks-real")
  })

  it("does not flag words that merely contain a token", () => {
    // "contest" contains "test"; "barbara" contains "bar".
    expect(codes(real({ email: "contest@gmail.com" }))).not.toContain("test-token-in-address")
    expect(codes(real({ email: "barbara@gmail.com" }))).not.toContain("test-token-in-address")
  })

  it("does not treat short real names as keyboard mashing", () => {
    for (const name of ["li", "wu", "amy", "jo", "ann"]) {
      expect(codes(real({ email: `${name}@gmail.com` })), name).not.toContain("mashed-address")
    }
  })

  it("does not flag a real business whose name happens to repeat letters", () => {
    expect(codes(real({ businessName: "Bookkeeping Plus" }))).not.toContain("mashed-business-name")
    expect(codes(real({ businessName: "Sunnyside Landscaping" }))).not.toContain("mashed-business-name")
  })

  it("never flags a customer merely for predating createdAt tracking", () => {
    // Regression guard: this used to count as a weak signal, so every older
    // real customer who hadn't made a flyer yet came out "suspicious".
    const old = real({ createdAt: null, flyersCreated: 0, lifetimeFlyersCreated: 0 })
    expect(verdictFor(signalsForClient(old))).toBe("looks-real")
    expect(auditClients([old]).flagged).toHaveLength(0)
    expect(auditClients([old])).toMatchObject({ counts: { "looks-real": 1 } })
  })

  it("treats a quiet real signup as suspicious at most, never as certain test data", () => {
    // Signed up, never finished, never made anything. Common and legitimate.
    const quiet = real({ hasPassword: false, flyersCreated: 0, lifetimeFlyersCreated: 0 })
    expect(verdictFor(signalsForClient(quiet))).toBe("suspicious")
  })

  it("does not claim 'never created a flyer' when the period counter says otherwise", () => {
    // Real production row: "1 flyer this period" alongside "never created a
    // single flyer". lifetimeFlyersCreated is 0 (not undefined) on records
    // predating that counter, so ?? never fell back to flyersCreated.
    const made = real({ flyersCreated: 1, lifetimeFlyersCreated: 0, hasPassword: false })
    expect(codes(made)).not.toContain("never-generated")
    expect(verdictFor(signalsForClient(made))).not.toBe("suspicious")
  })

  it("needs two weak signals before saying anything at all", () => {
    const oneWeak = real({ flyersCreated: 0, lifetimeFlyersCreated: 0 })
    expect(verdictFor(signalsForClient(oneWeak))).toBe("looks-real")
  })
})

describe("burst detection", () => {
  it("spots several accounts created within minutes of each other", () => {
    const base = Date.parse("2026-08-10T10:00:00.000Z")
    const clients = [0, 60_000, 120_000, 180_000].map((offset, i) =>
      real({ email: `u${i}@gmail.com`, createdAt: new Date(base + offset).toISOString() }),
    )
    const bursts = findBursts(clients)
    expect(bursts).toHaveLength(1)
    expect(bursts[0].emails).toHaveLength(4)
  })

  it("does not call ordinary spread-out signups a burst", () => {
    const base = Date.parse("2026-08-10T10:00:00.000Z")
    const day = 24 * 60 * 60 * 1000
    const clients = [0, day, 2 * day, 3 * day].map((offset, i) =>
      real({ email: `u${i}@gmail.com`, createdAt: new Date(base + offset).toISOString() }),
    )
    expect(findBursts(clients)).toHaveLength(0)
  })

  it("ignores a pair — two close signups is a coincidence, not a pattern", () => {
    const base = Date.parse("2026-08-10T10:00:00.000Z")
    const clients = [0, 30_000].map((offset, i) =>
      real({ email: `u${i}@gmail.com`, createdAt: new Date(base + offset).toISOString() }),
    )
    expect(findBursts(clients)).toHaveLength(0)
  })
})

describe("the whole report", () => {
  it("separates the obvious test rows from the real ones and never reports a real customer", () => {
    const clients = [
      real(),
      real({ email: "owner@cedarcreekroofing.com", businessName: "Cedar Creek Roofing" }),
      real({ email: "test@example.com", businessName: "Test Business", hasPassword: false, flyersCreated: 0, lifetimeFlyersCreated: 0 }),
      real({ email: "asdf@asdf.invalid", businessName: "asdf", hasPassword: false, flyersCreated: 0, lifetimeFlyersCreated: 0 }),
    ]
    const report = auditClients(clients)

    expect(report.totalClients).toBe(4)
    expect(report.counts["almost-certainly-test"]).toBe(2)
    expect(report.counts["looks-real"]).toBe(2)

    const flaggedEmails = report.flagged.map((f) => f.email)
    expect(flaggedEmails).not.toContain("sarah@millerheating.com")
    expect(flaggedEmails).not.toContain("owner@cedarcreekroofing.com")
  })

  it("reports the createdAt range so it can be compared against deployment history", () => {
    const report = auditClients([
      real({ email: "a@x.com", createdAt: "2026-08-01T00:00:00.000Z" }),
      real({ email: "b@x.com", createdAt: "2026-08-20T00:00:00.000Z" }),
    ])
    expect(report.createdAtRange.earliest).toBe("2026-08-01T00:00:00.000Z")
    expect(report.createdAtRange.latest).toBe("2026-08-20T00:00:00.000Z")
  })

  it("survives records with no createdAt at all", () => {
    const report = auditClients([real({ createdAt: null })])
    expect(report.totalClients).toBe(1)
    expect(report.createdAtRange.earliest).toBeNull()
  })
})
