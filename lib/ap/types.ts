// Types for the multi-client agent platform. Entirely separate from NOP's
// (lib/types.ts AgentProfile / RosterRecord are never used here).

export const ORG_STATUSES = ["intake", "building", "proof-sent", "live", "paused"] as const
export type OrgStatus = (typeof ORG_STATUSES)[number]

export const AP_LANGS = ["en", "es"] as const
export type ApLang = (typeof AP_LANGS)[number]

export const AP_TIERS = ["basic", "pro"] as const
export type ApTier = (typeof AP_TIERS)[number]

export const AGENT_STATUSES = ["pending", "active", "suspended"] as const
export type ApAgentStatus = (typeof AGENT_STATUSES)[number]

/** Where an agent's QR forwards and what their flyer prints. Same three-part shape as NOP's setting, per org. */
export interface ApEnrollment {
  /** https URL containing {id} exactly once: the agent's enrollment URL. */
  forwardTemplate: string
  /** "full": the forward URL; "short": printedTemplate; "code": the agent's own QR link. */
  printed: "full" | "short" | "code"
  /** For "short": host/path containing {id} once, no scheme. */
  printedTemplate: string | null
  /** Where a QR goes when its agent isn't active. */
  programUrl: string
}

export interface ApTierRules {
  /** The tier a new agent starts on. */
  defaultTier: ApTier
  /** "auto": a verified sign-up is active at once. "admin": it waits for approval. */
  signupApproval: "auto" | "admin"
}

export interface ApFooter {
  /** Left column, first line (NOP's "Neighborhood Outreach Program"). */
  programLine: string
  /** Left column, second line (NOP's "Sign in or enroll online"). */
  taglineLine: string
}

export interface ApFileRef {
  id: string
  /** Blob pathname; always under ap/orgs/{orgId}/. */
  path: string
  name: string
  contentType: string
  size: number
  uploadedBy: string
  uploadedAt: string
}

export interface ApOrg {
  id: string
  name: string
  slug: string
  status: OrgStatus
  enrollment: ApEnrollment
  /** Query parameter on the org's sign-up link that prefills the agent's ID, e.g. "agent_ID". */
  agentIdParam: string
  languages: ApLang[]
  footer: ApFooter
  tierRules: ApTierRules
  logo: ApFileRef | null
  referenceFiles: ApFileRef[]
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface ApAgent {
  /** Internal, random. Never printed. */
  agentId: string
  orgId: string
  /** The ID the org issued, used in the enrollment URL. Unique within the org. */
  externalId: string
  name: string
  phone: string
  email: string
  lang: ApLang
  tier: ApTier
  status: ApAgentStatus
  /** Set when the sign-up came through an active agent's ?ref= link in the SAME org. */
  recruiterAgentId: string | null
  createdAt: string
  approvedBy?: string
  approvedAt?: string
}

export interface ApOrgLogEntry {
  at: string
  by: string
  action: string
  detail?: string
}
