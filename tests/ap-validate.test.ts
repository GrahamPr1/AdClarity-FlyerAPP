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
    [{ enrollment: { ...good.enrollment, forwardTemplate: "ftp://join.example.com/{id}" } }, "enrollment.forwardTemplate"],
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

describe("URL fields: paste-and-go", () => {
  const enr = (forwardTemplate: string, extra: Record<string, unknown> = {}) => checkOrgConfig({ ...good, enrollment: { forwardTemplate, printed: "full", programUrl: "https://join.example.com/", ...extra } })
  const fwd = (v: string) => { const o = enr(v); return o.ok ? o.value.enrollment.forwardTemplate : `ERR ${!o.ok && o.field}: ${!o.ok && o.error}` }

  it("keeps a pasted https URL and its {id}", () => expect(fwd("https://join.example.com/enroll?agent={id}")).toBe("https://join.example.com/enroll?agent={id}"))
  it("adds https:// when there's no scheme", () => expect(fwd("join.example.com/enroll?agent={id}")).toBe("https://join.example.com/enroll?agent={id}"))
  it("collapses a doubled scheme", () => {
    expect(fwd("https://https://join.example.com/{id}")).toBe("https://join.example.com/{id}")
    expect(fwd("http://https://join.example.com/{id}")).toBe("https://join.example.com/{id}")
  })
  it("trims spaces and line breaks, including a wrapped paste", () => {
    expect(fwd("   https://join.example.com/{id}  \n")).toBe("https://join.example.com/{id}")
    expect(fwd("https://join.example.com/en\nroll/{id}")).toBe("https://join.example.com/enroll/{id}")
  })
  it("upgrades http:// to https://", () => expect(fwd("http://join.example.com/{id}")).toBe("https://join.example.com/{id}"))
  it("still requires {id}, naming the field", () => {
    const o = enr("join.example.com/enroll")
    expect(o).toMatchObject({ ok: false, field: "enrollment.forwardTemplate" })
    if (!o.ok) expect(o.error).toMatch(/Enrollment URL pattern: must contain \{id\}/)
  })
  it("refuses what still isn't an https URL, naming the field", () => {
    for (const bad of ["javascript:alert(1)//{id}", "not a url {id}", "localhost/{id}", "join.example.com:8443/{id}", ""]) {
      const o = enr(bad)
      expect(o.ok, bad).toBe(false)
      if (!o.ok) expect(o.field).toBe("enrollment.forwardTemplate")
    }
    const p = enr("join.example.com/{id}", { programUrl: "ftp://files.example.com/" })
    expect(p).toMatchObject({ ok: false, field: "enrollment.programUrl" })
  })
  it("normalizes the program page the same way", () => {
    const o = enr("join.example.com/{id}", { programUrl: "  http://www.example.com/start " })
    expect(o.ok && o.value.enrollment.programUrl).toBe("https://www.example.com/start")
  })
  it("keeps the printed address scheme-less: a pasted https:// is stripped, never added", () => {
    const o = enr("join.example.com/{id}", { printed: "short", printedTemplate: " https://https://Join.Example.com/{id} " })
    expect(o.ok && o.value.enrollment.printedTemplate).toBe("Join.Example.com/{id}")
    const plain = enr("join.example.com/{id}", { printed: "short", printedTemplate: "example.org/{id}" })
    expect(plain.ok && plain.value.enrollment.printedTemplate).toBe("example.org/{id}")
    const noId = enr("join.example.com/{id}", { printed: "short", printedTemplate: "https://example.org/" })
    expect(noId).toMatchObject({ ok: false, field: "enrollment.printedTemplate" })
  })
})
