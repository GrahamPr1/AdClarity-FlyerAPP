import { Redis } from "@upstash/redis"
import { getAgentIdOwner, getRosterRecord } from "@/lib/enterprise/agents-store"
import { qrDestinationFor } from "@/lib/enterprise/nop-roster"
import { getEnrollDomain } from "@/lib/enterprise/nop-enroll-domain"
import { agentIdForQrCode } from "@/lib/enterprise/nop-qr-code"
import type { NopLang } from "@/lib/enterprise/nop-i18n"
import { CANONICAL_SITE_URL } from "@/lib/site-url"
import { canUse } from "./features"
import { loadPortalContext } from "./context"
import { getApprovedText, type ApprovedTextKey } from "./approved-text"

// An active Pro/Leader agent's personal page: oneflyer.org/p/{code}.
//
// The code is the agent's existing QR code (lib/enterprise/nop-qr-code.ts),
// so the page never shows the Agent ID and nothing new is issued. /a/{code}
// stays the flyer QR; /p/{code} is the page the agent shares themselves
// (business cards, email signature, social), and is never printed on Basic
// Benefits' package flyers.
//
//   nop-agent:{agentId}:page   {"bookingUrl": string|null, "photo": {...}|null, "updatedAt"}
//
// Settings belong to the Agent ID, like the code. An admin data move doesn't
// carry them: the code (and so the page link) never moves either.

const redis = Redis.fromEnv()

export const NOP_PAGE_PATH = "/p"

export function nopPageLink(code: string): string {
  return `${CANONICAL_SITE_URL}${NOP_PAGE_PATH}/${code}`
}

// ---- Booking link ----------------------------------------------------------------

/**
 * The only booking links an agent may add. https, no credentials, no port,
 * and one of these exact hosts. Acuity gives each business its own
 * subdomain, so those two are matched as exactly one label under the domain.
 * Google Calendar's own host also serves every other calendar page, so only
 * its appointment-schedule paths are allowed.
 */
const BOOKING_HOSTS = new Set(["calendly.com", "www.calendly.com", "app.acuityscheduling.com", "calendar.app.google", "calendar.google.com"])
const ACUITY_SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:as\.me|acuityscheduling\.com)$/
const GOOGLE_APPOINTMENTS = /^\/calendar\/(?:u\/\d+\/)?appointments\//
export const MAX_BOOKING_URL = 500

export type BookingCheck = { ok: true; url: string | null } | { ok: false }

/** Blank clears the link. Anything not on the list above is refused. */
export function checkBookingUrl(raw: unknown): BookingCheck {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, url: null }
  if (typeof raw !== "string" || raw.length > MAX_BOOKING_URL) return { ok: false }
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false }
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return { ok: false }
  const host = u.hostname.toLowerCase()
  const known = BOOKING_HOSTS.has(host) || ACUITY_SUBDOMAIN.test(host)
  if (!known) return { ok: false }
  if (host === "calendar.google.com" && !GOOGLE_APPOINTMENTS.test(u.pathname)) return { ok: false }
  if ((host === "calendly.com" || host === "www.calendly.com" || host === "calendar.app.google") && u.pathname.replace(/\/+$/, "") === "") return { ok: false }
  return { ok: true, url: u.toString() }
}

// ---- Settings ----------------------------------------------------------------------

export interface AgentPagePhoto {
  /** Private Blob pathname. Read only through /p/{code}/photo. */
  path: string
  contentType: string
  updatedAt: string
}

export interface AgentPageSettings {
  bookingUrl: string | null
  photo: AgentPagePhoto | null
  updatedAt: string | null
}

const settingsKey = (agentId: string) => `nop-agent:${agentId}:page`
const EMPTY: AgentPageSettings = { bookingUrl: null, photo: null, updatedAt: null }

export async function getAgentPageSettings(agentId: string): Promise<AgentPageSettings> {
  const v = await redis.get<Partial<AgentPageSettings>>(settingsKey(agentId))
  if (!v || typeof v !== "object") return { ...EMPTY }
  return { bookingUrl: typeof v.bookingUrl === "string" ? v.bookingUrl : null, photo: v.photo ?? null, updatedAt: v.updatedAt ?? null }
}

async function patchSettings(agentId: string, patch: Partial<AgentPageSettings>): Promise<AgentPageSettings> {
  const next = { ...(await getAgentPageSettings(agentId)), ...patch, updatedAt: new Date().toISOString() }
  await redis.set(settingsKey(agentId), next)
  return next
}

/** Only a URL that passed checkBookingUrl, or null. */
export function saveBookingUrl(agentId: string, url: string | null): Promise<AgentPageSettings> {
  return patchSettings(agentId, { bookingUrl: url })
}

/** Returns the settings, and the photo it replaced (for the caller to delete from Blob). */
export async function setAgentPagePhoto(agentId: string, photo: AgentPagePhoto | null): Promise<{ settings: AgentPageSettings; replaced: AgentPagePhoto | null }> {
  const replaced = (await getAgentPageSettings(agentId)).photo
  return { settings: await patchSettings(agentId, { photo }), replaced }
}

// ---- Photo files -------------------------------------------------------------------

export const AGENT_PHOTO_PREFIX = "nop-agent-photos/"
export const MAX_AGENT_PHOTO_BYTES = 5 * 1024 * 1024

/** The type the bytes actually are (not what the browser claimed), or null. JPEG, PNG and WebP only. */
export function sniffPhotoType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png"
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp"
  return null
}

// ---- The public page -------------------------------------------------------------------

export const AGENT_PAGE_PACKAGES: { key: ApprovedTextKey; pkg: "P1" | "P2" | "P3" }[] = [
  { key: "packageP1", pkg: "P1" },
  { key: "packageP2", pkg: "P2" },
  { key: "packageP3", pkg: "P3" },
]

export interface AgentPageData {
  agentId: string
  code: string
  owner: string
  orgId: string
  agentLang: NopLang
  name: string
  phone: string
  email: string
  licenseStates: string[]
  enrollUrl: string
  bookingUrl: string | null
  /** Only while the org's photo switch is on (and a photo was uploaded). */
  photo: AgentPagePhoto | null
  /** The lead form is offered only when the agent can use lead capture too. */
  leads: boolean
}

/**
 * What /p/{code} shows, or null: the page exists only for a code issued to an
 * active roster agent, held by an account, who can use the agent page (tier,
 * org switch, active). Every other case, made-up codes included, is the same
 * null, so the page can't tell anyone which IDs exist.
 */
export async function agentPageFor(code: string): Promise<AgentPageData | null> {
  const agentId = await agentIdForQrCode(code)
  if (!agentId) return null
  const roster = await getRosterRecord(agentId)
  if (roster?.status !== "active") return null
  const owner = await getAgentIdOwner(agentId)
  if (!owner) return null
  const ctx = await loadPortalContext(owner)
  if (!ctx || ctx.agent.agentId !== agentId || !canUse(ctx, "agentPage")) return null
  const settings = await getAgentPageSettings(agentId)
  const p = ctx.agent.profile
  return {
    agentId,
    code,
    owner,
    orgId: ctx.orgId,
    agentLang: p.preferredLanguage ?? "en",
    name: p.displayName ?? p.name,
    phone: p.displayPhone ?? p.phone,
    email: p.displayEmail ?? p.email,
    licenseStates: p.licenseStates ?? [],
    enrollUrl: qrDestinationFor(agentId, await getEnrollDomain()),
    bookingUrl: settings.bookingUrl,
    photo: canUse(ctx, "agentPhoto") ? settings.photo : null,
    leads: canUse(ctx, "leads"),
  }
}

/**
 * The Basic agent's preview of the page they'd get with Pro (/agent/page/preview,
 * signed in only, never public): their real name, phone and email, the
 * program's enrollment link and packages; no photo or booking link (Pro
 * settings), and the form shown as a note.
 */
export async function agentPagePreviewFor(ctx: NonNullable<Awaited<ReturnType<typeof loadPortalContext>>>): Promise<Pick<AgentPageData, "name" | "phone" | "email" | "licenseStates" | "enrollUrl" | "bookingUrl" | "photo" | "leads" | "orgId">> {
  const p = ctx.agent.profile
  return {
    orgId: ctx.orgId,
    name: p.displayName ?? p.name,
    phone: p.displayPhone ?? p.phone,
    email: p.displayEmail ?? p.email,
    licenseStates: p.licenseStates ?? [],
    enrollUrl: qrDestinationFor(ctx.agent.agentId, await getEnrollDomain()),
    bookingUrl: null,
    photo: null,
    leads: ctx.orgFeatures.leads,
  }
}

/** The org's approved package texts in this language. A package whose text is still a placeholder isn't shown. */
export async function approvedPackages(orgId: string, lang: NopLang): Promise<{ pkg: string; heading: string; body: string }[]> {
  const texts = await Promise.all(AGENT_PAGE_PACKAGES.map(({ key }) => getApprovedText(orgId, key, lang)))
  return texts.flatMap((t, i) => {
    if (t.pending) return []
    const [heading, ...rest] = t.text.split("\n")
    return [{ pkg: AGENT_PAGE_PACKAGES[i].pkg, heading: heading.trim(), body: rest.join("\n").trim() }]
  })
}

/** Account deletion: removes the page settings; returns the photo, for the caller to delete from Blob. */
export async function deleteAgentPageSettings(agentId: string): Promise<AgentPagePhoto | null> {
  const { photo } = await getAgentPageSettings(agentId)
  await redis.del(settingsKey(agentId))
  return photo
}
