import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Deliverability basics for every agent email (new lead, RSVP, approval,
 * sign-in code, event reminder): a plain-text part that says the same as the
 * HTML, From "OneFlyer", a reply-to, and a footer saying why it was sent.
 */

const sent = vi.hoisted(() => [] as Record<string, unknown>[])
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (m: Record<string, unknown>) => (sent.push(m), { error: null }) }
  },
}))

beforeEach(() => {
  sent.length = 0
  vi.resetModules()
  vi.stubEnv("RESEND_API_KEY", "re_test")
  vi.stubEnv("RESEND_FROM_ADDRESS", "OneFlyer <noreply@oneflyer.org>")
  vi.stubEnv("EMAIL_REPLY_TO", "support@oneflyer.org")
})
afterEach(() => vi.unstubAllEnvs())

const lead = { name: "Ana Ruiz", phone: "(270) 555-0100", email: null, message: "Call after 5 <pm>", consent: { text: "I agree that Pat Lee may contact me." } }

async function all() {
  const m = await import("@/lib/email")
  await m.sendNopAgentLeadNotification({ to: "agent@x.test", lang: "en", lead, portalUrl: "https://oneflyer.org/agent/leads" })
  await m.sendNopAgentLeadNotification({ to: "agent@x.test", lang: "es", lead: { ...lead, email: "ana@x.test" }, portalUrl: "https://oneflyer.org/agent/leads", event: { title: "Día de inscripción", guests: 2 } })
  await m.sendAgentSignupDecision({ to: "agent@x.test", name: "Pat", lang: "en", approved: true, programName: "Neighborhood Outreach Program", signInUrl: "https://oneflyer.org/agent/signin" })
  await m.sendAgentVerificationCode("agent@x.test", "123456", "Neighborhood Outreach Program", "en", "signin")
  await m.sendEventReminder({ to: "ana@x.test", lang: "en", firstName: "Ana", title: "Enrollment day", when: "Wednesday at 6:00 PM CST", place: "Library", agentName: "Pat Lee", agentPhone: "(270) 555-0199", agentEmail: "pat@x.test", pageUrl: "https://oneflyer.org/e/abc" })
  return sent
}

describe("agent emails", () => {
  it("each has a plain-text part, From OneFlyer, a reply-to and a footer", async () => {
    const mails = await all()
    expect(mails).toHaveLength(5)
    for (const m of mails) {
      expect(m.from).toBe("OneFlyer <noreply@oneflyer.org>")
      expect(typeof m.text).toBe("string")
      expect((m.text as string).length).toBeGreaterThan(80)
      expect(m.text).not.toMatch(/<(p|a|div|table|tr|td|hr)[ >]/)
      expect(m.replyTo).toBeTruthy()
      expect(m.text).toContain("\n--\n")
    }
  })

  it("reply-to: the person when they gave an email, else support; the reminder replies to the agent", async () => {
    const [leadNoEmail, rsvp, approval, code, reminder] = await all()
    expect(leadNoEmail.replyTo).toBe("support@oneflyer.org")
    expect(leadNoEmail.text).toContain("didn't leave an email address")
    expect(rsvp.replyTo).toBe("ana@x.test")
    expect(rsvp.text).toContain("Acompañantes: 2")
    expect(approval.replyTo).toBe("support@oneflyer.org")
    expect(code.text).toContain("123456")
    expect(reminder.replyTo).toBe("pat@x.test")
  })

  it("the approval asks to add the From address to contacts and shows the sign-in URL in text", async () => {
    const approval = (await all())[2]
    expect(approval.text).toContain("Add noreply@oneflyer.org to your contacts so lead alerts don't go to spam.")
    expect(approval.text).toContain("https://oneflyer.org/agent/signin")
  })

  it("HTML escapes what people typed; the text part keeps it as typed", async () => {
    const first = (await all())[0]
    expect(first.html).toContain("Call after 5 &lt;pm&gt;")
    expect(first.text).toContain("Call after 5 <pm>")
  })

  it("without EMAIL_REPLY_TO, no reply-to on code and approval emails (as before)", async () => {
    vi.stubEnv("EMAIL_REPLY_TO", "")
    const [, , approval, code] = await all()
    expect(approval).not.toHaveProperty("replyTo")
    expect(code).not.toHaveProperty("replyTo")
  })
})
