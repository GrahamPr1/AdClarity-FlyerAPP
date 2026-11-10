import { listRoster } from "@/lib/enterprise/agents-store"
import { tNop } from "@/lib/enterprise/nop-i18n"
import { isNopTemplate } from "@/lib/enterprise/nop-render/kit"
import { isNopV2Template } from "@/lib/enterprise/nop-render/kit-v2-ids"
import { agentMaySeeTemplate, type NopFlyerSettings } from "@/lib/enterprise/nop-render/kit-v2-access"
import { flyerLabels } from "@/lib/enterprise/nop-render/flyer-labels"
import { getPrintRequestsForEmail, seedPrintRequest, updatePrintRequestStatus } from "@/lib/store"
import type { PrintRequest } from "@/lib/types"

// Print requests for NOP agents (Phase 8), on the existing print-request flow
// (lib/store.ts print-requests:{email}, the PrintRequest record and its
// Requested / Fulfilled / Cancelled statuses). As for businesses, it's NOT an
// order: nothing is printed or charged here. It queues a request that an admin
// (owner or program admin) sees, quotes and fulfils outside the app.
//
// The flyer is one of the program's templates in the kit agents are on;
// flyerId is the template id. The admin downloads the print file for that
// agent from the admin list (rendered with the agent's details, and logged in
// the download record), since a print shop needs the agent's own flyer.

export const PRINT_LIMITS = { quantity: 500, name: 80, address: 300, notes: 500 } as const

export type PrintCheck =
  | { ok: true; value: { template: string; quantity: number; shippingName: string; shippingAddress: string; notes: string | null } }
  | { ok: false; field: "template" | "quantity" | "shippingName" | "shippingAddress" | "notes" }

/** Field errors name the field; the route turns them into the agent's language. */
export function checkPrintRequest(raw: Record<string, unknown>, settings: NopFlyerSettings): PrintCheck {
  const template = typeof raw.template === "string" ? raw.template : ""
  if (!(isNopTemplate(template) || isNopV2Template(template)) || !agentMaySeeTemplate(template, settings, isNopTemplate(template))) return { ok: false, field: "template" }
  const quantity = Number(raw.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > PRINT_LIMITS.quantity) return { ok: false, field: "quantity" }
  const text = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "")
  const shippingName = text("shippingName"), shippingAddress = text("shippingAddress"), notes = text("notes")
  if (!shippingName || shippingName.length > PRINT_LIMITS.name) return { ok: false, field: "shippingName" }
  if (!shippingAddress || shippingAddress.length > PRINT_LIMITS.address) return { ok: false, field: "shippingAddress" }
  if (notes.length > PRINT_LIMITS.notes) return { ok: false, field: "notes" }
  return { ok: true, value: { template, quantity, shippingName, shippingAddress, notes: notes || null } }
}

/** "Package 2 · Complete Virtual Care · With prices (Spanish)": the admin list is English. */
export function printFlyerTitle(template: string): string {
  const l = flyerLabels(template)
  const lang = template.split("_")[2] === "ES" ? " (Spanish)" : ""
  return [tNop("en", l.eyebrow), tNop("en", l.name), l.pricing ? tNop("en", l.pricing) : null].filter(Boolean).join(" · ") + lang
}

export async function createAgentPrintRequest(email: string, v: Extract<PrintCheck, { ok: true }>["value"]): Promise<PrintRequest> {
  const request: PrintRequest = {
    id: crypto.randomUUID(), flyerId: v.template, flyerTitle: printFlyerTitle(v.template), quantity: v.quantity,
    shippingName: v.shippingName, shippingAddress: v.shippingAddress, notes: v.notes, status: "Requested", createdAt: new Date().toISOString(),
  }
  await seedPrintRequest(email, request)
  return request
}

/** The agent's own requests, newest first. Only NOP flyers (an account's business requests, if any, aren't shown here). */
export async function listAgentPrintRequests(email: string): Promise<PrintRequest[]> {
  return (await getPrintRequestsForEmail(email)).filter((r) => isNopTemplate(r.flyerId) || isNopV2Template(r.flyerId)).reverse()
}

export interface AdminPrintRequest extends PrintRequest {
  email: string
  agentId: string
  agentName: string
}

/** Every agent's print requests, newest first (the admin list). */
export async function listAllAgentPrintRequests(): Promise<AdminPrintRequest[]> {
  const roster = await listRoster()
  const rows = await Promise.all(roster.map(async (r) => {
    const email = r.lockedTo
    if (!email) return []
    return (await listAgentPrintRequests(email)).map((p) => ({ ...p, email, agentId: r.agentId, agentName: r.agentName }))
  }))
  return rows.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function findAgentPrintRequest(email: string, id: string): Promise<PrintRequest | null> {
  return (await listAgentPrintRequests(email)).find((r) => r.id === id) ?? null
}

export async function setAgentPrintRequestStatus(email: string, id: string, status: PrintRequest["status"]): Promise<boolean> {
  if (!(await findAgentPrintRequest(email, id))) return false
  return updatePrintRequestStatus(email, id, status)
}
