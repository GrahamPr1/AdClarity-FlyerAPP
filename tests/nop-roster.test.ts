import { describe, it, expect } from "vitest"
import {
  AGENT_ID_RE,
  expectedEnrollmentUrl,
  formatUsPhone,
  isGenerationStatus,
  isPlaceholder,
  maskEmail,
  parseCsv,
  qrDestinationFor,
  validateDisplayFields,
  validateRosterCsv,
} from "@/lib/enterprise/nop-roster"

const HEADER = "agent_id,company_name,agent_name,roster_email,roster_phone,referral_code,enrollment_url,status"
const row = (over: Partial<Record<string, string>> = {}) => {
  const v = {
    agent_id: "858980",
    company_name: "Acme Group",
    agent_name: "Pat Agent",
    roster_email: "Pat@Acme-Agents.org ",
    roster_phone: "270-555-0142",
    referral_code: "REF123",
    enrollment_url: "https://neighbor.basicbenefits.com/858980",
    status: "active",
    ...over,
  }
  return [v.agent_id, v.company_name, v.agent_name, v.roster_email, v.roster_phone, v.referral_code, v.enrollment_url, v.status].join(",")
}

describe("Agent ID format", () => {
  it.each(["1", "858980", "1234567890"])("accepts %s", (id) => expect(AGENT_ID_RE.test(id)).toBe(true))
  it.each(["", "12345678901", "85898O", " 858980", "858-980", "#858980"])("rejects %j", (id) => expect(AGENT_ID_RE.test(id)).toBe(false))
})

describe("QR destination", () => {
  it("is derived from the kit's enroll_domain, not the roster", () => {
    expect(qrDestinationFor("858980")).toBe("https://neighbor.basicbenefits.com/858980")
  })
  it("matches the URL the brief names for the mismatch flag", () => {
    expect(expectedEnrollmentUrl("858981")).toBe("https://neighbor.basicbenefits.com/" + "858981")
  })
})

describe("placeholders", () => {
  it.each(["", "  ", "[AGENT NAME]", "[PHONE]", "[PLATFORM-ISSUED TEST ID]", "TBD", "n/a", "xxx", "someone@example.com", "<email>"])(
    "treats %j as a placeholder",
    (v) => expect(isPlaceholder(v)).toBe(true),
  )
  it.each(["Pat Agent", "Quinn's Test Group", "REF123", "pat@gmail.com"])("accepts %j", (v) => expect(isPlaceholder(v)).toBe(false))
})

describe("phone formatting", () => {
  it("formats 10 digits however they were typed", () => {
    expect(formatUsPhone("2705550142")).toBe("(270) 555-0142")
    expect(formatUsPhone("+1 (270) 555.0142")).toBe("(270) 555-0142")
  })
  it("rejects anything that isn't a 10-digit number", () => {
    expect(formatUsPhone("555-0142")).toBeNull()
    expect(formatUsPhone("[PHONE]")).toBeNull()
  })
})

describe("CSV parsing", () => {
  it("handles quotes, embedded commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']])
  })
})

describe("roster validation", () => {
  it("accepts a clean row and normalizes email and phone", () => {
    const r = validateRosterCsv(`${HEADER}\n${row()}`)
    expect(r.rejected).toEqual([])
    expect(r.accepted[0]).toMatchObject({ rosterEmail: "pat@acme-agents.org", rosterPhone: "(270) 555-0142", status: "active" })
  })

  it("ignores extra columns such as test_case", () => {
    const r = validateRosterCsv(`${HEADER},test_case\n${row()},"Happy path, with a comma"`)
    expect(r.accepted).toHaveLength(1)
  })

  it("rejects Basic Benefits' bracketed sample row with a reason per field", () => {
    const sample = `${HEADER}\n858980,Quinn's Test Group,[AGENT NAME],[REAL INBOX FOR VERIFICATION],[PHONE],[REFERRAL CODE],[ENROLLMENT URL],active`
    const r = validateRosterCsv(sample)
    expect(r.accepted).toHaveLength(0)
    expect(r.rejected[0].line).toBe(2)
    expect(r.rejected[0].reasons.join("|")).toMatch(/agent_name.*roster_email.*roster_phone.*referral_code.*enrollment_url/)
  })

  it("rejects bad ids, emails and statuses rather than skipping them", () => {
    const r = validateRosterCsv([HEADER, row({ agent_id: "85898O" }), row({ agent_id: "1", roster_email: "nope" }), row({ agent_id: "2", status: "retired" })].join("\n"))
    expect(r.accepted).toHaveLength(0)
    expect(r.rejected.map((x) => x.line)).toEqual([2, 3, 4])
  })

  it("rejects a duplicate agent_id within one file", () => {
    const r = validateRosterCsv([HEADER, row(), row()].join("\n"))
    expect(r.accepted).toHaveLength(1)
    expect(r.rejected[0].reasons).toContain("agent_id appears more than once in this file")
  })

  it("flags, but keeps, an enrollment_url that doesn't match the id", () => {
    const r = validateRosterCsv(`${HEADER}\n${row({ enrollment_url: "https://neighbor.basicbenefits.com/858981" })}`)
    expect(r.accepted).toHaveLength(1)
    expect(r.accepted[0].enrollmentUrlMismatch).toBe(true)
    expect(r.flagged[0]).toMatchObject({ line: 2, agentId: "858980" })
  })

  it.each(["", "NA", "na", "N/A", " n/a "])("accepts referral_code %j as no code and stores it empty", (v) => {
    const r = validateRosterCsv(`${HEADER}\n${row({ referral_code: v })}`)
    expect(r.rejected).toEqual([])
    expect(r.accepted[0].referralCode).toBe("")
    expect(r.flagged).toEqual([])
  })

  it("still rejects other referral_code placeholders", () => {
    for (const v of ["[REFERRAL CODE]", "TBD"]) {
      const r = validateRosterCsv(`${HEADER}\n${row({ referral_code: v })}`)
      expect(r.rejected[0].reasons.join("|")).toMatch(/referral_code/)
    }
  })

  it("accepts a blank enrollment_url and flags it", () => {
    const r = validateRosterCsv(`${HEADER}\n${row({ enrollment_url: "" })}`)
    expect(r.accepted).toHaveLength(1)
    expect(r.accepted[0]).toMatchObject({ enrollmentUrl: "", enrollmentUrlMismatch: true })
    expect(r.flagged[0].reason).toMatch(/enrollment_url is blank/)
  })

  it("assumes https:// for an enrollment_url without a scheme", () => {
    const ok = validateRosterCsv(`${HEADER}\n${row({ enrollment_url: "neighbor.basicbenefits.com/858980" })}`)
    expect(ok.accepted[0]).toMatchObject({ enrollmentUrl: "https://neighbor.basicbenefits.com/858980", enrollmentUrlMismatch: false })
    expect(ok.flagged).toEqual([])

    const other = validateRosterCsv(`${HEADER}\n${row({ enrollment_url: "join.basicbenefits.com" })}`)
    expect(other.accepted[0]).toMatchObject({ enrollmentUrl: "https://join.basicbenefits.com", enrollmentUrlMismatch: true })
    expect(other.flagged[0].reason).toContain('(given as "join.basicbenefits.com")')
  })

  it("accepts Basic Benefits' updated sample rows (NA referral, bare join URL, 10-digit phone), flagged", () => {
    const csv =
      `${HEADER},test_case\r\n` +
      `858980,Quinn's Test Group,Quinn Pearl,quinn.pearl@basicbenefits.com,5029998888,NA,join.basicbenefits.com,active,"Happy path, with a comma"\r\n` +
      `858981,Brandi's Test Group,Brandi Ray,brandi.ray@basicbenefits.com,5028889999,NA,join.basicbenefits.com,active,"Second agent"\r\n`
    const r = validateRosterCsv(csv)
    expect(r.rejected).toEqual([])
    expect(r.accepted.map((a) => [a.agentId, a.rosterPhone, a.referralCode])).toEqual([
      ["858980", "(502) 999-8888", ""],
      ["858981", "(502) 888-9999", ""],
    ])
    expect(r.flagged.map((f) => f.agentId)).toEqual(["858980", "858981"])
    // The QR destination never comes from the roster.
    expect(qrDestinationFor("858980")).toBe("https://neighbor.basicbenefits.com/858980")
  })

  it("refuses a file missing a required column", () => {
    const r = validateRosterCsv("agent_id,agent_name\n1,x")
    expect(r.fileErrors.length).toBeGreaterThan(0)
    expect(r.accepted).toHaveLength(0)
  })
})

describe("display fields", () => {
  it("returns only the three display fields, whatever else is sent", () => {
    const r = validateDisplayFields({ displayName: " Pat ", displayPhone: "2705550142", displayEmail: "P@X.org", agentId: "1", rosterEmail: "evil@x.org" })
    expect(r).toEqual({ ok: true, values: { displayName: "Pat", displayPhone: "(270) 555-0142", displayEmail: "p@x.org" } })
  })
  it("reports each invalid field", () => {
    const r = validateDisplayFields({ displayName: "", displayPhone: "123", displayEmail: "x" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["displayEmail", "displayName", "displayPhone"])
  })
})

describe("generation status", () => {
  it("is true only for active", () => {
    expect(isGenerationStatus({ status: "active" })).toBe(true)
    for (const s of ["pending", "suspended", "terminated"] as const) expect(isGenerationStatus({ status: s })).toBe(false)
  })
  it("treats a missing roster record as not active", () => {
    expect(isGenerationStatus(null)).toBe(false)
  })
})

describe("maskEmail", () => {
  it("keeps the domain and the first letter", () => expect(maskEmail("gpearl@gmail.com")).toBe("g***@gmail.com"))
})
