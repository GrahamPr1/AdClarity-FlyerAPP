/**
 * Heuristics for spotting test / preview data sitting in a production
 * database.
 *
 * Written because preview deployments shared the production Redis instance
 * for roughly the first eleven days of this project's life, and the
 * environment guardrail only warned rather than refusing (fixed in
 * lib/env.ts — see verdictForMarker). Anything created by someone poking at
 * a preview URL during that window landed in live customer data.
 *
 * These are HEURISTICS and they are deliberately conservative about the word
 * "test". A signal being present does not prove a record is fake, and this
 * module never deletes anything — it produces a report for a human to judge.
 * The distinction between `strong` and `weak` signals exists precisely so
 * that a real customer who happens to have made no flyers yet is not lumped
 * in with someone who signed up as "asdf@example.com".
 */

export interface AuditableClient {
  email: string
  businessName: string | null
  createdAt: string | null
  plan: string
  flyersCreated: number
  lifetimeFlyersCreated?: number
  hasPassword: boolean
}

export type SignalStrength = "strong" | "weak"

export interface Signal {
  code: string
  strength: SignalStrength
  detail: string
}

export type Verdict = "almost-certainly-test" | "suspicious" | "looks-real"

export interface ClientAudit {
  email: string
  businessName: string | null
  createdAt: string | null
  plan: string
  flyersCreated: number
  verdict: Verdict
  signals: Signal[]
  /** Context, not evidence: the record is older than createdAt tracking. */
  predatesCreatedAtTracking: boolean
}

// RFC 2606 / RFC 6761 reserved names — these can never belong to a real
// mailbox, so an account using one was necessarily created by a person
// testing something.
const RESERVED_DOMAINS = ["example.com", "example.org", "example.net", "example.edu"]
const RESERVED_TLDS = [".invalid", ".test", ".example", ".localhost", ".local"]

// Local-part tokens that essentially only appear in throwaway accounts. Kept
// tight on purpose: "test" as a substring would flag "protestant@…", so these
// match the local part as a whole word rather than anywhere in the string.
const TEST_TOKENS = [
  "test", "tests", "testing", "tester", "qa", "qatest", "demo", "sample", "dummy",
  "fake", "foo", "bar", "baz", "temp", "tmp", "throwaway", "placeholder",
  "asdf", "asdfasdf", "qwerty", "abc", "aaa", "xxx", "noreply", "no-reply",
]

const TEST_BUSINESS_NAMES = [
  "test", "testing", "test business", "test company", "test co", "my business",
  "acme", "acme corp", "acme inc", "example", "example business", "demo",
  "demo business", "sample", "foo", "bar", "asdf", "abc", "aaa", "xyz",
  "business name", "company name", "untitled", "n/a", "na", "none",
]

/** Splits an email into local part and domain, both lowercased. */
function parts(email: string): { local: string; domain: string } {
  const at = email.lastIndexOf("@")
  if (at === -1) return { local: email.toLowerCase(), domain: "" }
  return { local: email.slice(0, at).toLowerCase(), domain: email.slice(at + 1).toLowerCase() }
}

/**
 * Keyboard-mash detection: "asdfgh", "qweqwe", "jjjjj".
 *
 * Three cheap tests, all requiring a reasonable length so short real names
 * ("li", "wu", "amy") can never trip them.
 */
function looksLikeKeyboardMash(value: string): boolean {
  const s = value.toLowerCase().replace(/[^a-z]/g, "")
  if (s.length < 4) return false

  // A run of one character: "aaaa", "jjjjjj".
  if (/(.)\1{3,}/.test(s)) return true

  // A short unit repeated: "qweqweqwe", "abcabc".
  for (let unit = 1; unit <= 3; unit++) {
    if (s.length >= unit * 3) {
      const head = s.slice(0, unit)
      if (head.repeat(Math.floor(s.length / unit)).slice(0, s.length) === s) return true
    }
  }

  // A straight walk along a keyboard row.
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
  for (const row of rows) {
    for (let i = 0; i + 4 <= row.length; i++) {
      if (s.includes(row.slice(i, i + 4))) return true
    }
  }
  return false
}

/** Signals visible from a single record, with no reference to the rest of the set. */
export function signalsForClient(client: AuditableClient): Signal[] {
  const signals: Signal[] = []
  const { local, domain } = parts(client.email)

  if (RESERVED_DOMAINS.includes(domain)) {
    signals.push({ code: "reserved-domain", strength: "strong", detail: `@${domain} is a reserved documentation domain and can never receive mail` })
  }
  const reservedTld = RESERVED_TLDS.find((tld) => domain.endsWith(tld))
  if (reservedTld) {
    signals.push({ code: "reserved-tld", strength: "strong", detail: `${reservedTld} is a reserved TLD that cannot resolve` })
  }

  // Whole-word match against the local part, splitting on separators, so
  // "test" matches "test" and "john.test" but not "contest".
  const localWords = local.split(/[._+\-0-9]+/).filter(Boolean)
  const hitToken = localWords.find((w) => TEST_TOKENS.includes(w))
  if (hitToken) {
    signals.push({ code: "test-token-in-address", strength: "strong", detail: `address contains the throwaway token "${hitToken}"` })
  }

  if (looksLikeKeyboardMash(local)) {
    signals.push({ code: "mashed-address", strength: "strong", detail: "address local part looks like keyboard mashing" })
  }

  const name = (client.businessName ?? "").trim().toLowerCase()
  if (name && TEST_BUSINESS_NAMES.includes(name)) {
    signals.push({ code: "placeholder-business-name", strength: "strong", detail: `business name "${client.businessName}" is a placeholder` })
  } else if (name && looksLikeKeyboardMash(name)) {
    signals.push({ code: "mashed-business-name", strength: "strong", detail: `business name "${client.businessName}" looks like keyboard mashing` })
  }

  // Weak on their own — plenty of real people sign up, look around and leave.
  if (!client.hasPassword) {
    signals.push({ code: "no-credential", strength: "weak", detail: "no password was ever set, so the signup was never completed" })
  }
  // The MAX of both counters, not `lifetime ?? period`. ?? only falls back on
  // undefined, and lifetimeFlyersCreated is 0 — not undefined — for every
  // record predating that counter. So an account showing "1 flyer this period"
  // was simultaneously being reported as having never created one, and any
  // real customer who generated flyers before lifetime tracking existed picked
  // up a false weak signal toward being called test data.
  if (Math.max(client.lifetimeFlyersCreated ?? 0, client.flyersCreated) === 0) {
    signals.push({ code: "never-generated", strength: "weak", detail: "never created a single flyer" })
  }

  // A missing createdAt is deliberately NOT a signal. It says when the field
  // was added to the schema, not whether the account is genuine — every
  // record older than that tracking lacks it. Counting it made any long-
  // standing real customer who hadn't yet made a flyer come out "suspicious",
  // which is precisely the smearing this module has to avoid. It is reported
  // as context on the row instead (see predatesCreatedAtTracking).

  return signals
}

export function verdictFor(signals: Signal[]): Verdict {
  const strong = signals.filter((s) => s.strength === "strong").length
  const weak = signals.filter((s) => s.strength === "weak").length
  if (strong >= 1) return "almost-certainly-test"
  if (weak >= 2) return "suspicious"
  return "looks-real"
}

/**
 * Accounts created in tight clusters.
 *
 * Real signups arrive independently; a handful landing within seconds of each
 * other is the fingerprint of someone clicking through a form repeatedly, so
 * cluster membership is added as an extra signal on top of the per-record
 * ones.
 */
export function findBursts(
  clients: AuditableClient[],
  windowMs = 10 * 60 * 1000,
  minSize = 3,
): { startedAt: string; emails: string[] }[] {
  const timed = clients
    .filter((c) => c.createdAt)
    .map((c) => ({ email: c.email, t: new Date(c.createdAt as string).getTime() }))
    .filter((c) => Number.isFinite(c.t))
    .sort((a, b) => a.t - b.t)

  const bursts: { startedAt: string; emails: string[] }[] = []
  let group: typeof timed = []

  const flush = () => {
    if (group.length >= minSize) {
      bursts.push({ startedAt: new Date(group[0].t).toISOString(), emails: group.map((g) => g.email) })
    }
    group = []
  }

  for (const entry of timed) {
    if (group.length === 0 || entry.t - group[group.length - 1].t <= windowMs) {
      group.push(entry)
    } else {
      flush()
      group = [entry]
    }
  }
  flush()
  return bursts
}

export interface AuditReport {
  totalClients: number
  counts: Record<Verdict, number>
  flagged: ClientAudit[]
  bursts: { startedAt: string; emails: string[] }[]
  /** Oldest and newest createdAt seen, for comparing against deployment history. */
  createdAtRange: { earliest: string | null; latest: string | null }
}

export function auditClients(clients: AuditableClient[]): AuditReport {
  const bursts = findBursts(clients)
  const burstMembers = new Map<string, string>()
  for (const b of bursts) for (const e of b.emails) burstMembers.set(e, b.startedAt)

  const audits: ClientAudit[] = clients.map((c) => {
    const signals = signalsForClient(c)
    const burstAt = burstMembers.get(c.email)
    if (burstAt) {
      signals.push({ code: "created-in-burst", strength: "weak", detail: `created in a cluster of rapid signups starting ${burstAt}` })
    }
    return {
      email: c.email,
      businessName: c.businessName,
      createdAt: c.createdAt,
      plan: c.plan,
      flyersCreated: c.flyersCreated,
      verdict: verdictFor(signals),
      signals,
      predatesCreatedAtTracking: !c.createdAt,
    }
  })

  const counts: Record<Verdict, number> = { "almost-certainly-test": 0, suspicious: 0, "looks-real": 0 }
  for (const a of audits) counts[a.verdict]++

  const times = clients
    .map((c) => (c.createdAt ? new Date(c.createdAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)

  return {
    totalClients: clients.length,
    counts,
    flagged: audits
      .filter((a) => a.verdict !== "looks-real")
      .sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === "almost-certainly-test" ? -1 : 1)),
    bursts,
    createdAtRange: {
      earliest: times.length ? new Date(times[0]).toISOString() : null,
      latest: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    },
  }
}
