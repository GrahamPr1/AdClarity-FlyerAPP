import { Redis } from "@upstash/redis"
import type { ContentAsset } from "@/lib/types"
import type { NopLang } from "@/lib/enterprise/nop-i18n"

// Org-approved wording that public pages show verbatim: for now the consent
// line on an agent's lead form. Stored as ContentAsset records (locked, text)
// under the usual content-asset:{id} key, but deliberately NOT in the org's
// asset index, so the enterprise generation pipeline never reads them.
//
//   content-asset:approved-text:{orgId}:{key}:{lang}      the current text
//   approved-text-history:{orgId}:{key}:{lang}            every saved version, newest first
//
// Until an admin saves the org's real wording, each text is a placeholder,
// and any public page that needs it shows "Coming soon" instead (isPending).

const redis = Redis.fromEnv()

export const APPROVED_TEXT_KEYS = ["leadConsent"] as const
export type ApprovedTextKey = (typeof APPROVED_TEXT_KEYS)[number]

export function isApprovedTextKey(v: unknown): v is ApprovedTextKey {
  return typeof v === "string" && (APPROVED_TEXT_KEYS as readonly string[]).includes(v)
}

export const APPROVED_TEXT_LABELS: Record<ApprovedTextKey, string> = { leadConsent: "Lead form consent" }

const PLACEHOLDER_MARK = "[PENDING ORG APPROVAL"
export const APPROVED_TEXT_PLACEHOLDER: Record<ApprovedTextKey, string> = { leadConsent: `${PLACEHOLDER_MARK} — consent text]` }

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
