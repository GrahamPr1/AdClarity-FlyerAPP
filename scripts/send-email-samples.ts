/**
 * Sends one SAMPLE of each scheduled public email to an address you choose,
 * so the wording can be read before its switch is turned on (the digest:
 * PUBLIC_DIGEST_LIVE=1; the monthly results: PUBLIC_MONTHLY_EMAIL_LIVE=1).
 *
 *   npx tsx scripts/send-email-samples.ts you@example.com [digest] [monthly]
 *
 * "monthly" sends three: Basic/Pro with activity, trial (scans only), and a
 * month with no activity at all. Their flyer names and numbers are invented
 * for the layout check.
 *
 * Every sample's subject starts "[Sample] ". The leads in the digest sample
 * are invented test entries ("Sample Lead …", 555 numbers) — a layout check,
 * not anyone's data. The unsubscribe links in a sample are real and signed for
 * the address it is sent to.
 */
import "./load-env"
import { renderLeadDigest, renderMonthlyResults, sendRendered, type DigestLead, type MonthlyFlyerResult } from "../lib/public-emails"

const to = process.argv[2]
const which = new Set(process.argv.slice(3).length ? process.argv.slice(3) : ["digest"])
if (!to || !to.includes("@")) {
  console.error("usage: send-email-samples.ts <to-address> [digest] [monthly]")
  process.exit(2)
}

const now = Date.now()
const SAMPLE_LEADS: DigestLead[] = [
  { name: "Sample Lead One", phone: "(270) 555-0101", email: "sample.one@example.com", message: "Can you come out Saturday morning?", createdAt: new Date(now - 3 * 3600e3).toISOString(), flyerTitle: "Fall roof replacement special", afterOfferEnded: false },
  { name: "Sample Lead Two", phone: "(270) 555-0102", email: null, message: null, createdAt: new Date(now - 7 * 3600e3).toISOString(), flyerTitle: "Fall roof replacement special", afterOfferEnded: false },
  { name: "Sample Lead Three", phone: "(270) 555-0103", email: null, message: "Saw your flyer at the library.", createdAt: new Date(now - 20 * 3600e3).toISOString(), flyerTitle: "Gutter guard install", afterOfferEnded: true },
]

async function main() {
  if (which.has("digest")) {
    const r = await sendRendered(renderLeadDigest({ to, leads: SAMPLE_LEADS, subjectPrefix: "[Sample] " }))
    console.log(`digest sample to ${to}: ${r.sent ? "sent" : `NOT sent — ${r.reason}`}`)
  }
  if (which.has("monthly")) {
    const month = "2026-10"
    const paid: MonthlyFlyerResult[] = [
      { title: "Fall roof replacement special", scans: 23, clicks: 9, leads: 3 },
      { title: "Gutter guard install", scans: 7, clicks: 2, leads: 0 },
      { title: "Free roof inspection", scans: 0, clicks: 0, leads: 0 },
    ]
    const samples = [
      { label: "monthly (Basic/Pro)", email: renderMonthlyResults({ to, month, scansOnly: false, flyers: paid, subjectPrefix: "[Sample] " }) },
      { label: "monthly (trial, scans only)", email: renderMonthlyResults({ to, month, scansOnly: true, flyers: paid.map(({ title, scans }) => ({ title, scans })), subjectPrefix: "[Sample] " }) },
      { label: "monthly (no activity)", email: renderMonthlyResults({ to, month, scansOnly: false, flyers: paid.map((f) => ({ ...f, scans: 0, clicks: 0, leads: 0 })), subjectPrefix: "[Sample] " }) },
    ]
    for (const s of samples) {
      const r = await sendRendered(s.email)
      console.log(`${s.label} sample to ${to}: ${r.sent ? "sent" : `NOT sent — ${r.reason}`}`)
    }
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
