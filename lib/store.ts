import type { Deliverables, IntakeSubmission } from "./types"

// ---------------------------------------------------------------------------
// PLACEHOLDER in-memory store.
//
// This is scaffolding only. In production, intake submissions and deliverable
// state will live in a real database, and the external Claude-based agent
// pipeline will read intake data and write finished deliverables back (via the
// /api/agent-callback webhook). Do NOT rely on this store for persistence — it
// resets whenever the server restarts.
// ---------------------------------------------------------------------------

// Latest intake submission (single-tenant placeholder).
let latestIntake: IntakeSubmission | null = null

export function saveIntake(submission: IntakeSubmission) {
  latestIntake = { ...submission, submittedAt: new Date().toISOString() }
  return latestIntake
}

export function getIntake(): IntakeSubmission | null {
  return latestIntake
}

// Mock deliverables with a mix of statuses so the dashboard can be seen in all
// states. In production this is populated/updated by the agent pipeline.
export const deliverables: Deliverables = {
  planId: "foundation_plus",
  planName: "Plus",
  billingStatus: "Active",
  intakeStatus: "Submitted",
  flyers: [
    { id: "flyer-1", title: "Front Desk Sheet", status: "Ready", thumbnailUrl: "/images/flyer-front-desk.png", downloadUrl: "#" },
    { id: "flyer-2", title: "New Client Packet", status: "Ready", thumbnailUrl: "/images/flyer-new-client.png", downloadUrl: "#" },
    { id: "flyer-3", title: "Referral Card", status: "In Progress" },
    { id: "flyer-4", title: "Service Menu", status: "In Progress" },
    { id: "flyer-5", title: "Partner One-Pager", status: "Pending" },
    { id: "flyer-6", title: "Promo Flyer", status: "Pending" },
  ],
  website: {
    id: "site-1",
    status: "In Progress",
    url: undefined,
  },
}

// Update a deliverable's status/fields — used by the agent-callback webhook.
export function updateDeliverable(payload: {
  type: "flyer" | "website"
  id: string
  status?: string
  thumbnailUrl?: string
  downloadUrl?: string
  url?: string
}) {
  if (payload.type === "flyer") {
    const flyer = deliverables.flyers.find((f) => f.id === payload.id)
    if (!flyer) return null
    if (payload.status) flyer.status = payload.status as typeof flyer.status
    if (payload.thumbnailUrl) flyer.thumbnailUrl = payload.thumbnailUrl
    if (payload.downloadUrl) flyer.downloadUrl = payload.downloadUrl
    return flyer
  }
  if (payload.type === "website") {
    if (payload.status) deliverables.website.status = payload.status as typeof deliverables.website.status
    if (payload.url) deliverables.website.url = payload.url
    return deliverables.website
  }
  return null
}
