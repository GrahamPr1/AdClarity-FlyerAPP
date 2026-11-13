import { Redis } from "@upstash/redis"
import { randomBytes, randomInt } from "node:crypto"
import type { ApAgent, ApAgentStatus, ApFileRef, ApOrg, ApOrgLogEntry, ApTier, OrgStatus } from "./types"
import type { OrgConfigInput, SignupInput } from "./validate"
import type { ApContent, ApPackage } from "./templates/content"

// Every Redis read and write the agent platform makes. Every key starts with
// "ap:" (checked by tests/ap-namespace.test.ts); nothing here reads or writes
// a NOP key, a client:* key, or any other existing key.
//
//   ap:orgs                               set of org ids
//   ap:org:{orgId}                        ApOrg
//   ap:org-slug:{slug}                    orgId (SET NX: slugs are unique)
//   ap:org:{orgId}:log                    ApOrgLogEntry list, newest first (kept 500)
//   ap:org:{orgId}:agents                 zset agentId by sign-up time
//   ap:org:{orgId}:ext-id:{externalId}    agentId (SET NX: one holder per org-issued ID)
//   ap:org:{orgId}:email:{email}          agentId (SET NX: one agent per email per org)
//   ap:agent:{agentId}                    ApAgent
//   ap:qr:{code}                          {agentId, orgId}   issued once, never changed
//   ap:agent:{agentId}:qr                 {code}
//   ap:recruit:{code}                     {agentId, orgId}
//   ap:agent:{agentId}:recruit            {code}
//   ap:org:{orgId}:content                ApContent (the draft packages)
//   ap:org:{orgId}:approved               ApApproved (the version agents get)
//   ap:org:{orgId}:approved-log           earlier ApApproved versions, newest first
//
// Values that are bare strings are stored as small JSON objects, because the
// client JSON-parses on read ("123" would come back as the number 123).

const redis = Redis.fromEnv()

export const K = {
  orgs: "ap:orgs",
  org: (id: string) => `ap:org:${id}`,
  slug: (slug: string) => `ap:org-slug:${slug}`,
  log: (id: string) => `ap:org:${id}:log`,
  orgAgents: (id: string) => `ap:org:${id}:agents`,
  extId: (orgId: string, ext: string) => `ap:org:${orgId}:ext-id:${ext}`,
  email: (orgId: string, email: string) => `ap:org:${orgId}:email:${email}`,
  agent: (id: string) => `ap:agent:${id}`,
  qr: (code: string) => `ap:qr:${code}`,
  agentQr: (id: string) => `ap:agent:${id}:qr`,
  recruit: (code: string) => `ap:recruit:${code}`,
  agentRecruit: (id: string) => `ap:agent:${id}:recruit`,
  content: (id: string) => `ap:org:${id}:content`,
  approved: (id: string) => `ap:org:${id}:approved`,
  approvedLog: (id: string) => `ap:org:${id}:approved-log`,
} as const

/** No 0/O/o, 1/l/I: nothing a person could misread off a printed URL. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"
export const CODE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{7}$/

export function randomCode(length = 7): string {
  let out = ""
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`

function obj<T>(v: unknown): T | null {
  if (v == null) return null
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }
  return v as T
}

async function log(orgId: string, entry: Omit<ApOrgLogEntry, "at">): Promise<void> {
  await redis.lpush(K.log(orgId), JSON.stringify({ at: new Date().toISOString(), ...entry }))
  await redis.ltrim(K.log(orgId), 0, 499)
}

export async function listOrgLog(orgId: string, limit = 50): Promise<ApOrgLogEntry[]> {
  const rows = await redis.lrange(K.log(orgId), 0, limit - 1)
  return rows.map((r) => obj<ApOrgLogEntry>(r)).filter((r): r is ApOrgLogEntry => !!r)
}

// ---- Orgs -------------------------------------------------------------------

export async function getOrg(id: string): Promise<ApOrg | null> {
  if (!/^org_[A-Za-z0-9_-]{6,20}$/.test(id)) return null
  return obj<ApOrg>(await redis.get(K.org(id)))
}

export async function getOrgBySlug(slug: string): Promise<ApOrg | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null
  const ref = obj<{ orgId: string }>(await redis.get(K.slug(slug)))
  if (!ref) return null
  const org = await getOrg(ref.orgId)
  // A stale slug pointer (renamed org) never resolves to another org.
  return org && org.slug === slug ? org : null
}

export async function listOrgs(): Promise<ApOrg[]> {
  const ids = (await redis.smembers(K.orgs)) as string[]
  const orgs = await Promise.all(ids.map((id) => getOrg(id)))
  return orgs.filter((o): o is ApOrg => !!o).sort((a, b) => a.name.localeCompare(b.name))
}

export async function createOrg(input: OrgConfigInput, admin: string): Promise<{ ok: true; org: ApOrg } | { ok: false; error: "slug_taken" }> {
  const id = newId("org")
  const claimed = await redis.set(K.slug(input.slug), JSON.stringify({ orgId: id }), { nx: true })
  if (claimed !== "OK") return { ok: false, error: "slug_taken" }
  const now = new Date().toISOString()
  const org: ApOrg = { id, ...input, status: "intake", logo: null, referenceFiles: [], createdAt: now, createdBy: admin, updatedAt: now, updatedBy: admin }
  await redis.set(K.org(id), JSON.stringify(org))
  await redis.sadd(K.orgs, id)
  await log(id, { by: admin, action: "created", detail: `${org.name} (${org.slug})` })
  return { ok: true, org }
}

export async function updateOrgConfig(id: string, input: OrgConfigInput, admin: string): Promise<{ ok: true; org: ApOrg } | { ok: false; error: "not_found" | "slug_taken" }> {
  const org = await getOrg(id)
  if (!org) return { ok: false, error: "not_found" }
  if (input.slug !== org.slug) {
    const claimed = await redis.set(K.slug(input.slug), JSON.stringify({ orgId: id }), { nx: true })
    if (claimed !== "OK") return { ok: false, error: "slug_taken" }
    await redis.del(K.slug(org.slug))
  }
  const next: ApOrg = { ...org, ...input, updatedAt: new Date().toISOString(), updatedBy: admin }
  await redis.set(K.org(id), JSON.stringify(next))
  const changed = (Object.keys(input) as (keyof OrgConfigInput)[]).filter((k) => JSON.stringify(org[k]) !== JSON.stringify(input[k]))
  await log(id, { by: admin, action: "config", detail: changed.join(", ") || "no change" })
  return { ok: true, org: next }
}

export async function setOrgStatus(id: string, status: OrgStatus, admin: string): Promise<ApOrg | null> {
  const org = await getOrg(id)
  if (!org) return null
  const next: ApOrg = { ...org, status, updatedAt: new Date().toISOString(), updatedBy: admin }
  await redis.set(K.org(id), JSON.stringify(next))
  await log(id, { by: admin, action: "status", detail: `${org.status} -> ${status}` })
  return next
}

export async function setOrgFiles(id: string, change: { logo?: ApFileRef | null; addReference?: ApFileRef; removeReference?: string }, admin: string): Promise<ApOrg | null> {
  const org = await getOrg(id)
  if (!org) return null
  const next: ApOrg = { ...org, updatedAt: new Date().toISOString(), updatedBy: admin }
  if (change.logo !== undefined) next.logo = change.logo
  if (change.addReference) next.referenceFiles = [...org.referenceFiles, change.addReference]
  if (change.removeReference) next.referenceFiles = org.referenceFiles.filter((f) => f.id !== change.removeReference)
  await redis.set(K.org(id), JSON.stringify(next))
  await log(id, {
    by: admin,
    action: "files",
    detail: change.logo !== undefined ? `logo ${change.logo ? change.logo.name : "removed"}` : change.addReference ? `added ${change.addReference.name}` : `removed ${change.removeReference}`,
  })
  return next
}

// ---- Agents -----------------------------------------------------------------

// KEYS: ext-id key, email key, agent key, org agents zset.
// ARGV: agentId JSON, agent JSON, score, agentId.
// Both claims or neither: an ID or email already held in this org is refused.
const CREATE_AGENT = `
if redis.call("EXISTS", KEYS[1]) == 1 then return "ext_taken" end
if redis.call("EXISTS", KEYS[2]) == 1 then return "email_taken" end
redis.call("SET", KEYS[1], ARGV[1])
redis.call("SET", KEYS[2], ARGV[1])
redis.call("SET", KEYS[3], ARGV[2])
redis.call("ZADD", KEYS[4], ARGV[3], ARGV[4])
return "ok"`

export async function createAgent(
  org: ApOrg,
  input: Omit<SignupInput, "ref">,
  recruiterAgentId: string | null,
): Promise<{ ok: true; agent: ApAgent } | { ok: false; error: "ext_taken" | "email_taken" }> {
  const agentId = newId("ag")
  const now = new Date()
  const agent: ApAgent = {
    agentId,
    orgId: org.id,
    externalId: input.externalId,
    name: input.name,
    phone: input.phone,
    email: input.email,
    lang: input.lang,
    tier: org.tierRules.defaultTier,
    status: org.tierRules.signupApproval === "auto" ? "active" : "pending",
    recruiterAgentId,
    createdAt: now.toISOString(),
  }
  const out = await redis.eval<string[], string>(
    CREATE_AGENT,
    [K.extId(org.id, input.externalId), K.email(org.id, input.email), K.agent(agentId), K.orgAgents(org.id)],
    [JSON.stringify({ agentId }), JSON.stringify(agent), String(now.getTime()), agentId],
  )
  if (out === "ext_taken" || out === "email_taken") return { ok: false, error: out }
  await log(org.id, { by: input.email, action: "signup", detail: `${input.externalId} ${agent.status}${recruiterAgentId ? ` (recruited by ${recruiterAgentId})` : ""}` })
  return { ok: true, agent }
}

export async function getAgent(agentId: string): Promise<ApAgent | null> {
  if (!/^ag_[A-Za-z0-9_-]{6,20}$/.test(agentId)) return null
  return obj<ApAgent>(await redis.get(K.agent(agentId)))
}

/** The agent this email holds in THIS org, or null. Never looks in another org. */
export async function agentForEmail(orgId: string, email: string): Promise<ApAgent | null> {
  const ref = obj<{ agentId: string }>(await redis.get(K.email(orgId, email)))
  const agent = ref ? await getAgent(ref.agentId) : null
  return agent && agent.orgId === orgId && agent.email === email ? agent : null
}

/** Whether this org-issued ID is already held in THIS org. */
export async function externalIdTaken(orgId: string, externalId: string): Promise<boolean> {
  return (await redis.exists(K.extId(orgId, externalId))) === 1
}

export async function listOrgAgents(orgId: string): Promise<ApAgent[]> {
  const ids = (await redis.zrange(K.orgAgents(orgId), 0, -1)) as string[]
  const agents = await Promise.all(ids.map((id) => getAgent(id)))
  return agents.filter((a): a is ApAgent => !!a && a.orgId === orgId)
}

export async function updateAgent(
  orgId: string,
  agentId: string,
  change: { status?: ApAgentStatus; tier?: ApTier },
  admin: string,
): Promise<ApAgent | null> {
  const agent = await getAgent(agentId)
  // An agent is only ever changed through its own org.
  if (!agent || agent.orgId !== orgId) return null
  const next: ApAgent = { ...agent }
  if (change.status) {
    next.status = change.status
    if (change.status === "active" && agent.status === "pending") {
      next.approvedBy = admin
      next.approvedAt = new Date().toISOString()
    }
  }
  if (change.tier) next.tier = change.tier
  await redis.set(K.agent(agentId), JSON.stringify(next))
  await log(orgId, { by: admin, action: "agent", detail: `${agent.externalId}: ${JSON.stringify(change)}` })
  return next
}

// ---- QR and recruit codes ---------------------------------------------------

// KEYS: the agent's code key, candidate code key. ARGV: {"code"} JSON, {"agentId","orgId"} JSON.
const ISSUE_CODE = `
local existing = redis.call("GET", KEYS[1])
if existing then return existing end
if redis.call("EXISTS", KEYS[2]) == 1 then return "taken" end
redis.call("SET", KEYS[2], ARGV[2])
redis.call("SET", KEYS[1], ARGV[1])
return ARGV[1]`

async function issueCode(agent: ApAgent, agentKey: string, codeKey: (c: string) => string): Promise<string> {
  const existing = obj<{ code: string }>(await redis.get(agentKey))
  if (existing?.code) return existing.code
  for (let i = 0; i < 8; i++) {
    const candidate = randomCode()
    const out = await redis.eval<string[], unknown>(ISSUE_CODE, [agentKey, codeKey(candidate)], [JSON.stringify({ code: candidate }), JSON.stringify({ agentId: agent.agentId, orgId: agent.orgId })])
    if (out === "taken") continue
    const code = obj<{ code: string }>(out)?.code
    if (code) return code
  }
  throw new Error(`couldn't issue a code for ${agent.agentId}`)
}

export const getOrIssueQrCode = (agent: ApAgent) => issueCode(agent, K.agentQr(agent.agentId), K.qr)
export const getOrIssueRecruitCode = (agent: ApAgent) => issueCode(agent, K.agentRecruit(agent.agentId), K.recruit)

async function resolveCode(key: string): Promise<{ agent: ApAgent; org: ApOrg } | null> {
  const ref = obj<{ agentId: string; orgId: string }>(await redis.get(key))
  if (!ref) return null
  const [agent, org] = await Promise.all([getAgent(ref.agentId), getOrg(ref.orgId)])
  return agent && org && agent.orgId === org.id ? { agent, org } : null
}

export async function resolveQrCode(code: string) {
  return CODE_RE.test(code) ? resolveCode(K.qr(code)) : null
}

/** The recruiter behind a ?ref= code: only an ACTIVE agent of the SAME org counts. */
export async function recruiterFor(orgId: string, ref: string | null): Promise<ApAgent | null> {
  if (!ref || !CODE_RE.test(ref)) return null
  const hit = await resolveCode(K.recruit(ref))
  return hit && hit.org.id === orgId && hit.agent.status === "active" ? hit.agent : null
}

// ---- Flyer content and approvals --------------------------------------------

/** What an approval pins: the exact content and, per template and size, the hash and spacing it rendered with. */
export interface ApApproved {
  version: number
  approvedAt: string
  approvedBy: string
  note: string
  orgName: string
  orgCode: string
  footer: ApOrg["footer"]
  languages: ApOrg["languages"]
  logo: ApFileRef | null
  packages: ApPackage[]
  /** "{templateId}:{size}" -> what the approval rendered. */
  templates: Record<string, { hash: string; spacing: string }>
}

export async function getContent(orgId: string): Promise<ApContent | null> {
  return obj<ApContent>(await redis.get(K.content(orgId)))
}

export async function saveContent(orgId: string, packages: ApPackage[], admin: string): Promise<ApContent> {
  const content: ApContent = { packages, updatedAt: new Date().toISOString(), updatedBy: admin }
  await redis.set(K.content(orgId), JSON.stringify(content))
  await log(orgId, { by: admin, action: "content", detail: `${packages.length} package(s)` })
  return content
}

export async function getApproved(orgId: string): Promise<ApApproved | null> {
  return obj<ApApproved>(await redis.get(K.approved(orgId)))
}

export async function saveApproved(orgId: string, approved: Omit<ApApproved, "version">): Promise<ApApproved> {
  const prev = await getApproved(orgId)
  const next: ApApproved = { ...approved, version: (prev?.version ?? 0) + 1 }
  if (prev) {
    await redis.lpush(K.approvedLog(orgId), JSON.stringify(prev))
    await redis.ltrim(K.approvedLog(orgId), 0, 49)
  }
  await redis.set(K.approved(orgId), JSON.stringify(next))
  await log(orgId, { by: approved.approvedBy, action: "approved", detail: `version ${next.version}, ${Object.keys(next.templates).length} template renders${approved.note ? `: ${approved.note}` : ""}` })
  return next
}

/** Every logo path any approved version (current or kept) still prints, so it's never deleted from under it. */
export async function approvedLogoPaths(orgId: string): Promise<Set<string>> {
  const cur = await getApproved(orgId)
  const old = (await redis.lrange(K.approvedLog(orgId), 0, -1)).map((r) => obj<ApApproved>(r))
  return new Set([cur, ...old].map((a) => a?.logo?.path).filter((p): p is string => !!p))
}
