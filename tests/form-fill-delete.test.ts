import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({
  sub: "owner@example.com" as string | null,
  jobs: {} as Record<string, { id: string; title: string; status: string; resultUrl?: string; createdAt: string }[]>,
  blobs: [] as { pathname: string; url: string }[],
  deleted: [] as string[],
  blobFails: false,
}))

vi.mock("@/lib/auth", () => ({ ADMIN_SUB: "admin", getSessionIdentity: vi.fn(async () => (state.sub ? { sub: state.sub } : null)) }))
vi.mock("@/lib/store", () => ({
  getFormFillsForEmail: vi.fn(async (email: string) => structuredClone(state.jobs[email] ?? [])),
  deleteFormFillRequest: vi.fn(async (email: string, id: string) => {
    const match = state.jobs[email]?.find((r) => r.id === id) ?? null
    state.jobs[email] = (state.jobs[email] ?? []).filter((r) => r.id !== id)
    return match
  }),
}))
vi.mock("@vercel/blob", () => ({
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({ blobs: state.blobs.filter((b) => b.pathname.startsWith(prefix)) })),
  del: vi.fn(async (urls: string[]) => {
    if (state.blobFails) throw new Error("blob down")
    state.deleted.push(...urls)
    state.blobs = state.blobs.filter((b) => !urls.includes(b.url))
  }),
}))

import { DELETE } from "@/app/api/form-fill/[id]/route"

const call = (id: string) => DELETE(new NextRequest(`http://localhost/api/form-fill/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) })
const blobUrl = (email: string, id: string) => `https://store.private.blob.vercel-storage.com/form-fills/${email}/${id}.pdf`

beforeEach(() => {
  state.sub = "owner@example.com"
  state.blobFails = false
  state.deleted = []
  state.jobs = {
    "owner@example.com": [
      { id: "ready1", title: "test-fillable.pdf", status: "Ready", resultUrl: blobUrl("owner@example.com", "ready1"), createdAt: "2026-10-20" },
      { id: "failed1", title: "test-fillable.pdf", status: "Failed", createdAt: "2026-10-21" },
      { id: "running1", title: "w9.pdf", status: "In Progress", createdAt: "2026-10-22" },
    ],
    "other@example.com": [{ id: "theirs1", title: "theirs.pdf", status: "Ready", resultUrl: blobUrl("other@example.com", "theirs1"), createdAt: "2026-10-20" }],
  }
  state.blobs = [
    { pathname: "form-fills/owner@example.com/ready1.pdf", url: blobUrl("owner@example.com", "ready1") },
    { pathname: "form-fills/owner@example.com/ready10.pdf", url: blobUrl("owner@example.com", "ready10") },
    { pathname: "form-fills/other@example.com/theirs1.pdf", url: blobUrl("other@example.com", "theirs1") },
  ]
})

describe("DELETE /api/form-fill/[id]", () => {
  it("removes a Ready job and exactly its own filled PDF", async () => {
    const res = await call("ready1")
    expect(res.status).toBe(200)
    expect(state.jobs["owner@example.com"].map((j) => j.id)).toEqual(["failed1", "running1"])
    expect(state.deleted).toEqual([blobUrl("owner@example.com", "ready1")])
    // A different job whose id merely starts the same is untouched.
    expect(state.blobs.map((b) => b.pathname)).toContain("form-fills/owner@example.com/ready10.pdf")
  })

  it("removes a Failed job (no file to delete)", async () => {
    expect((await call("failed1")).status).toBe(200)
    expect(state.jobs["owner@example.com"].map((j) => j.id)).toEqual(["ready1", "running1"])
    expect(state.deleted).toEqual([])
  })

  it("refuses a job that is still running", async () => {
    expect((await call("running1")).status).toBe(409)
    expect(state.jobs["owner@example.com"]).toHaveLength(3)
  })

  it("only the owner can delete: another account's job is not found and untouched", async () => {
    expect((await call("theirs1")).status).toBe(404)
    expect(state.jobs["other@example.com"]).toHaveLength(1)
    expect(state.deleted).toEqual([])
  })

  it("refuses signed-out and admin sessions", async () => {
    state.sub = null
    expect((await call("ready1")).status).toBe(401)
    state.sub = "admin"
    expect((await call("ready1")).status).toBe(401)
    expect(state.jobs["owner@example.com"]).toHaveLength(3)
  })

  it("keeps the job listed if the file can't be deleted, so it can be retried", async () => {
    state.blobFails = true
    expect((await call("ready1")).status).toBe(502)
    expect(state.jobs["owner@example.com"]).toHaveLength(3)
  })
})
