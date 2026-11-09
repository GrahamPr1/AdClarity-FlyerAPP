import { Redis } from "@upstash/redis"
import type { ContentAsset } from "@/lib/types"
import type { NopLang } from "@/lib/enterprise/nop-i18n"

// Org-approved wording shown or sent verbatim: the consent line on an agent's
// lead form, the package descriptions on an agent's page, and the follow-up
// messages an agent opens in their own Messages or email app. Stored as ContentAsset records (locked, text)
// under the usual content-asset:{id} key, but deliberately NOT in the org's
// asset index, so the enterprise generation pipeline never reads them.
//
//   content-asset:approved-text:{orgId}:{key}:{lang}      the current text
//   approved-text-history:{orgId}:{key}:{lang}            every saved version, newest first
//
// Until an admin saves the org's real wording, each text is a placeholder,
// and any public page that needs it shows "Coming soon" instead (isPending).

const redis = Redis.fromEnv()

export const APPROVED_TEXT_KEYS = ["leadConsent", "packageP1", "packageP2", "packageP3", "followUp1", "followUp2", "followUp3"] as const
export type ApprovedTextKey = (typeof APPROVED_TEXT_KEYS)[number]

export function isApprovedTextKey(v: unknown): v is ApprovedTextKey {
  return typeof v === "string" && (APPROVED_TEXT_KEYS as readonly string[]).includes(v)
}

export const APPROVED_TEXT_LABELS: Record<ApprovedTextKey, string> = {
  leadConsent: "Lead form consent",
  packageP1: "Agent page: package P1 (Everyday Care). First line is the heading",
  packageP2: "Agent page: package P2 (Complete Virtual Care). First line is the heading",
  packageP3: "Agent page: package P3 (Health & Weight Management). First line is the heading",
  followUp1: "Follow-up message 1",
  followUp2: "Follow-up message 2",
  followUp3: "Follow-up message 3",
}

const FOLLOW_UP_HELP =
  "First line: the email subject. Lines below: the message (used for both the text and the email). Fill-ins: {lead_first_name}, {lead_name}, {agent_name}, {agent_first_name}, {agent_phone}, {agent_email}, {enroll_url}. While it's the placeholder, agents get no button for it."

/** Extra guidance under a text's label in admin. */
export const APPROVED_TEXT_HELP: Partial<Record<ApprovedTextKey, string>> = {
  followUp1: FOLLOW_UP_HELP,
  followUp2: FOLLOW_UP_HELP,
  followUp3: FOLLOW_UP_HELP,
}

const PLACEHOLDER_MARK = "[PENDING ORG APPROVAL"
export const APPROVED_TEXT_PLACEHOLDER: Record<ApprovedTextKey, string> = {
  leadConsent: `${PLACEHOLDER_MARK} — consent text]`,
  packageP1: `${PLACEHOLDER_MARK} — package P1 text]`,
  packageP2: `${PLACEHOLDER_MARK} — package P2 text]`,
  packageP3: `${PLACEHOLDER_MARK} — package P3 text]`,
  followUp1: `${PLACEHOLDER_MARK} — follow-up message 1]`,
  followUp2: `${PLACEHOLDER_MARK} — follow-up message 2]`,
  followUp3: `${PLACEHOLDER_MARK} — follow-up message 3]`,
}

/** A text that is missing, blank, or still carries the placeholder mark anywhere in it. */
export function isPendingText(text: string | null | undefined): boolean {
  return !text || text.trim() === "" || text.includes(PLACEHOLDER_MARK)
}

export const MAX_APPROVED_TEXT = 2000

export interface ApprovedText {
  id: string
  key: ApprovedTextKey
  lang: NopLang
  text: string
  /** 0 = the placeholder (never saved). */
  version: number
  pending: boolean
  updatedBy: string | null
  updatedAt: string | null
}

const assetId = (orgId: string, key: ApprovedTextKey, lang: NopLang) => `approved-text:${orgId}:${key}:${lang}`
const historyKey = (orgId: string, key: ApprovedTextKey, lang: NopLang) => `approved-text-history:${orgId}:${key}:${lang}`

function fromAsset(orgId: string, key: ApprovedTextKey, lang: NopLang, a: ContentAsset | null): ApprovedText {
  if (!a) return { id: assetId(orgId, key, lang), key, lang, text: APPROVED_TEXT_PLACEHOLDER[key], version: 0, pending: true, updatedBy: null, updatedAt: null }
  return { id: a.id, key, lang, text: a.content, version: a.approvedText?.version ?? 1, pending: isPendingText(a.content), updatedBy: a.approvedText?.updatedBy ?? null, updatedAt: a.createdAt }
}

export async function getApprovedText(orgId: string, key: ApprovedTextKey, lang: NopLang): Promise<ApprovedText> {
  const a = await redis.get<ContentAsset>(`content-asset:${assetId(orgId, key, lang)}`)
  return fromAsset(orgId, key, lang, a ?? null)
}

/** Admin only. Saving blank text puts the placeholder back (and the page back to "Coming soon"). */
export async function saveApprovedText(orgId: string, key: ApprovedTextKey, lang: NopLang, text: string, by: string): Promise<ApprovedText> {
  const current = await getApprovedText(orgId, key, lang)
  const content = text.trim() === "" ? APPROVED_TEXT_PLACEHOLDER[key] : text.trim()
  const asset: ContentAsset = {
    id: assetId(orgId, key, lang),
    orgId,
    assetType: "text",
    sourceLabel: `${APPROVED_TEXT_LABELS[key]} (${lang.toUpperCase()})`,
    locked: true,
    content,
    createdAt: new Date().toISOString(),
    approvedText: { key, lang, version: current.version + 1, updatedBy: by },
  }
  await Promise.all([redis.set(`content-asset:${asset.id}`, asset), redis.lpush(historyKey(orgId, key, lang), asset)])
  return fromAsset(orgId, key, lang, asset)
}

export async function listApprovedTextHistory(orgId: string, key: ApprovedTextKey, lang: NopLang, limit = 20): Promise<ContentAsset[]> {
  return redis.lrange<ContentAsset>(historyKey(orgId, key, lang), 0, limit - 1)
}
