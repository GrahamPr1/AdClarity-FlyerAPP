import kitContent from "@/enterprise/nop/kit-v1.1.1/content.json"
import type { AgentRosterStatus, RosterRecord } from "@/lib/types"
import { tNop, type NopLang } from "./nop-i18n"

// Pure, dependency-free roster logic for the Neighborhood Outreach Program.
//
// Everything here is deterministic so it can be pinned in vitest; the Redis
// side lives in ./agents-store.ts.

export const NOP_ORG_ID = "nop"
export const NOP_ORG_NAME = kitContent.program.name

/** Issued by NOP. Digits only, so a pasted "858980 " or "#858980" is not silently a different agent. */
export const AGENT_ID_RE = /^\d{1,10}$/

export const ROSTER_STATUSES: readonly AgentRosterStatus[] = ["pending", "active", "suspended", "terminated"]

const COLUMNS = [
  "agent_id",
  "company_name",
  "agent_name",
  "roster_email",
  "roster_phone",
  "referral_code",
  "enrollment_url",
  "status",
] as const

/**
 * Where an agent's QR codes point. Derived from the kit's enroll_domain, never
 * taken from the roster: the roster's enrollment_url is NOP-typed data, and a
 * typo there would silently route an agent's commissions somewhere else.
 */
export function qrDestinationFor(agentId: string): string {
  const domain = kitContent.enroll_domain.replace(/\/+$/, "")
  return `https://${domain}/${agentId}`
}

/** What enrollment_url should be. Used ONLY to flag a mismatch on import. */
export function expectedEnrollmentUrl(agentId: string): string {
  return qrDestinationFor(agentId)
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase()
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

/** (XXX) XXX-XXXX, or null when it isn't a 10-digit US number (an optional leading 1 is allowed). */
export function formatUsPhone(v: string): string | null {
  let digits = v.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1)
  if (digits.length !== 10) return null
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/**
 * Values that mean "someone forgot to fill this in". Basic Benefits' sample
 * roster uses bracketed tokens — [AGENT NAME], [PHONE], [PLATFORM-ISSUED TEST
 * ID] — so any fully bracketed value counts, alongside the usual words.
 */
export function isPlaceholder(v: string): boolean {
  const s = v.trim()
  if (s === "") return true
  if (/^[[{<].*[\]}>]$/.test(s)) return true
  if (/^(tbd|tba|n\/?a|none|null|todo|placeholder|xxx+|x+|-+|\?+)$/i.test(s)) return true
  if (/@(example\.(com|org|net)|test\.com)$/i.test(s)) return true
  return false
}

/** Blank, NA or N/A: the agent has no referral code. */
export function isNoReferralCode(v: string): boolean {
  return /^(n\/?a)?$/i.test(v.trim())
}

/**
 * Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines
 * inside quotes, CRLF. Not a dependency for the sake of ~30 lines.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const src = text.replace(/^﻿/, "")
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += ch
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Blank lines carry no row.
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

export interface RosterRowRejection {
  /** 1-based line in the file, header = 1. */
  line: number
  agentId: string
  reasons: string[]
}

export interface RosterRowFlag {
  line: number
  agentId: string
  reason: string
}

export interface RosterParseResult {
  /** Fatal problems with the file as a whole (missing columns). Nothing is imported when set. */
  fileErrors: string[]
  accepted: Omit<RosterRecord, "importedAt">[]
  rejected: RosterRowRejection[]
  flagged: RosterRowFlag[]
}

/**
 * Validates a roster CSV. Every row is either accepted or rejected with its
 * reasons — never silently dropped. An enrollment_url that disagrees with the
 * Agent ID is flagged but still accepted (it is not used for anything live).
 */
export function validateRosterCsv(text: string): RosterParseResult {
  const result: RosterParseResult = { fileErrors: [], accepted: [], rejected: [], flagged: [] }
  const rows = parseCsv(text)
  if (rows.length === 0) {
    result.fileErrors.push("The file is empty.")
    return result
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const index: Record<string, number> = {}
  for (const col of COLUMNS) {
    const at = header.indexOf(col)
    if (at === -1) result.fileErrors.push(`Missing column: ${col}`)
    else index[col] = at
  }
  if (result.fileErrors.length > 0) return result

  const seen = new Set<string>()
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2
    const raw = (col: (typeof COLUMNS)[number]) => (cells[index[col]] ?? "").trim()
    // referral_code is on no flyer, so "no code" (blank, NA, N/A) is stored
    // empty. enrollment_url is never used for the QR or the flyer: blank is
    // accepted (and flagged below), a missing scheme is assumed https.
    const get = (col: (typeof COLUMNS)[number]) => {
      const v = raw(col)
      if (col === "referral_code" && isNoReferralCode(v)) return ""
      if (col === "enrollment_url" && v !== "" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !isPlaceholder(v)) return `https://${v}`
      return v
    }
    const optional = (col: (typeof COLUMNS)[number]) =>
      (col === "referral_code" && get(col) === "") || (col === "enrollment_url" && get(col) === "")
    const agentId = get("agent_id")
    const reasons: string[] = []

    for (const col of COLUMNS) {
      if (!optional(col) && isPlaceholder(get(col))) reasons.push(`${col} is empty or a placeholder ("${get(col)}")`)
    }
    const filled = (col: (typeof COLUMNS)[number]) => !isPlaceholder(get(col))

    if (filled("agent_id") && !AGENT_ID_RE.test(agentId)) reasons.push("agent_id must be 1-10 digits")
    if (filled("roster_email") && !isValidEmail(get("roster_email"))) reasons.push("roster_email is not a valid email")
    if (filled("roster_phone") && !formatUsPhone(get("roster_phone"))) reasons.push("roster_phone is not a 10-digit US number")
    if (filled("referral_code") && !/^[A-Za-z0-9_-]{1,64}$/.test(get("referral_code"))) {
      reasons.push("referral_code may only contain letters, digits, - and _")
    }
    const status = get("status").toLowerCase()
    if (filled("status") && !ROSTER_STATUSES.includes(status as AgentRosterStatus)) {
      reasons.push(`status must be one of ${ROSTER_STATUSES.join(", ")}`)
    }
    if (filled("enrollment_url")) {
      try {
        new URL(get("enrollment_url"))
      } catch {
        reasons.push("enrollment_url is not a valid URL")
      }
    }
    if (AGENT_ID_RE.test(agentId)) {
      if (seen.has(agentId)) reasons.push("agent_id appears more than once in this file")
      seen.add(agentId)
    }

    if (reasons.length > 0) {
      result.rejected.push({ line, agentId, reasons })
      return
    }

    const enrollmentUrl = get("enrollment_url")
    const expected = expectedEnrollmentUrl(agentId)
    const urlMismatch = enrollmentUrl !== expected
    if (enrollmentUrl === "") {
      result.flagged.push({ line, agentId, reason: `enrollment_url is blank, expected "${expected}"` })
    } else if (urlMismatch) {
      const typed = raw("enrollment_url") === enrollmentUrl ? "" : ` (given as "${raw("enrollment_url")}")`
      result.flagged.push({ line, agentId, reason: `enrollment_url is "${enrollmentUrl}"${typed}, expected "${expected}"` })
    }

    result.accepted.push({
      agentId,
      companyName: get("company_name"),
      agentName: get("agent_name"),
      rosterEmail: normalizeEmail(get("roster_email")),
      rosterPhone: formatUsPhone(get("roster_phone"))!,
      referralCode: get("referral_code"),
      enrollmentUrl,
      enrollmentUrlMismatch: urlMismatch,
      status: status as AgentRosterStatus,
    })
  })

  return result
}

export interface DisplayFields {
  displayName: string
  displayPhone: string
  displayEmail: string
}

/**
 * Validates the three agent-editable fields. Anything else in `input` is
 * ignored by construction — this returns only these three keys.
 */
export function validateDisplayFields(
  input: Record<string, unknown>,
  lang: NopLang = "en",
): { ok: true; values: DisplayFields } | { ok: false; errors: Record<string, string> } {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "")
  const errors: Record<string, string> = {}

  const displayName = str("displayName")
  if (!displayName) errors.displayName = tNop(lang, "val.name_required")
  else if (displayName.length > 80) errors.displayName = tNop(lang, "val.name_long")

  const displayPhone = formatUsPhone(str("displayPhone"))
  if (!displayPhone) errors.displayPhone = tNop(lang, "val.phone")

  const displayEmail = str("displayEmail")
  if (!isValidEmail(displayEmail)) errors.displayEmail = tNop(lang, "val.email")

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, values: { displayName, displayPhone: displayPhone!, displayEmail: normalizeEmail(displayEmail) } }
}

/** "g***@gmail.com" — enough for an agent to recognise their inbox without disclosing it. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@")
  if (!domain) return "***"
  return `${user.slice(0, 1)}***@${domain}`
}

/** Generation is allowed ONLY for an active roster record. A missing record is not active. */
export function isGenerationStatus(record: Pick<RosterRecord, "status"> | null | undefined): boolean {
  return record?.status === "active"
}
