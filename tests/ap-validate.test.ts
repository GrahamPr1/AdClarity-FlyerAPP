import { describe, it, expect } from "vitest"
import { checkOrgConfig, checkSignup, enrollmentUrlFor, externalIdFromQuery } from "@/lib/ap/validate"

const good = {
  name: "Sample Benefits Co.",
  slug: "sample-benefits",
  orgCode: "SBC",
  enrollment: { forwardTemplate: "https://join.example.com/?agent={id}", printed: "full", programUrl: "https://join.example.com/" },
  agentIdParam: "agent_ID",
  languages: ["en", "es"],
  footer: { programLine: "Sample Outreach Program", taglineLine: "Sign in or enroll online" },
  tierRules: { defaultTier: "basic", signupApproval: "admin" },
}

describe("org config", () => {
  it("accepts a complete config", () => {
    expect(checkOrgConfig(good)).toMatchObject({ ok: true })
  })
  it.each([
    [{ name: "x".repeat(61) }, "name"],
    [{ name: "" }, "name"],
    [{ slug: "Ab" }, "slug"],
    [{ slug: "-bad" }, "slug"],
    [{ slug: "q" + "" }, "slug"],
    [{ enrollment: { ...good.enrollment, forwardTemplate: "https://join.example.com/" } }, "enrollment.forwardTemplate"],
    [{ enrollment: { ...good.enrollment, forwardTemplate: "http://join.example.com/{id}" } }, "enrollment.forwardTemplate"],
    [{ enrollment: { ...good.enrollment, forwardTemplate: "https://a.example/{id}/{id}" } }, "enrollment.forwardTemplate"],
    [{ enrollment: { ...good.enrollment, printed: "short", printedTemplate: "join.example.com" } }, "enrollment.printedTemplate"],
    [{ enrollment: { ...good.enrollment, programUrl: "javascript:alert(1)" } }, "enrollment.programUrl"],
    [{ agentIdParam: "1bad" }, "agentIdParam"],
    [{ languages: ["fr"] }, "languages"],
    [{ languages: [] }, "languages"],
    [{ footer: { ...good.footer, programLine: "x".repeat(41) } }, "footer.programLine"],
    [{ tierRules: { defaultTier: "leader", signupApproval: "admin" } }, "tierRules.defaultTier"],
  ])("rejects %j", (patch, field) => {
    const out = checkOrgConfig({ ...good, ...patch })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.field).toBe(field)
  })
})

describe("sign-up", () => {
  const s = { externalId: "CP-VLN-H5J", name: "Pat Sample", phone: "502-555-0100", email: " Pat@Example.com ", lang: "es", ref: "Ab3dE5g" }
  it("normalizes and keeps the ID exactly as issued", () => {
    expect(checkSignup(s, ["en", "es"])).toEqual({ ok: true, value: { externalId: "CP-VLN-H5J", name: "Pat Sample", phone: "(502) 555-0100", email: "pat@example.com", lang: "es", ref: "Ab3dE5g" } })
  })
  it("falls back to the org's first language", () => {
    const out = checkSignup(s, ["en"])
    expect(out.ok && out.value.lang).toBe("en")
  })
  it.each([
    [{ externalId: "#858980" }, "externalId"],
    [{ externalId: "x".repeat(33) }, "externalId"],
    [{ name: "x".repeat(41) }, "name"],
    [{ phone: "555-0100" }, "phone"],
    [{ email: "nope" }, "email"],
  ])("rejects %j", (patch, field) => {
    const out = checkSignup({ ...s, ...patch }, ["en", "es"])
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.field).toBe(field)
  })
})

describe("links", () => {
  it("fills {id} encoded, and reads the org's param case-insensitively", () => {
    expect(enrollmentUrlFor({ forwardTemplate: "https://j.example/?a={id}", printed: "full", printedTemplate: null, programUrl: "https://j.example/" }, "A B")).toBe("https://j.example/?a=A%20B")
    expect(externalIdFromQuery(new URLSearchParams("AGENT_id=CP-1"), "agent_ID")).toBe("CP-1")
    expect(externalIdFromQuery(new URLSearchParams("agent_ID=1&agent_id=2"), "agent_ID")).toBeNull()
    expect(externalIdFromQuery(new URLSearchParams("agent_ID=%23bad"), "agent_ID")).toBeNull()
  })
})
