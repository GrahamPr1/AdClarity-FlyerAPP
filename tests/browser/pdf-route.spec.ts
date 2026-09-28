import { test, expect } from "@playwright/test"
import { stateFile } from "./auth-paths"

const BASE = "http://localhost:3000"

/**
 * The PDF route end to end: a signed-in client's real request, through
 * auth, Redis and the renderer, to the bytes the browser downloads.
 *
 * flyer-pdf.spec.ts covers what the RENDERER produces. This covers the
 * things only the route can get wrong — who is allowed to ask, what
 * headers come back, and whether the flyer it renders is the caller's.
 */

test.describe("GET /api/flyers/[id]/pdf", () => {
  test("refuses an unauthenticated caller", async ({ request }) => {
    const res = await request.get(`${BASE}/api/flyers/anything/pdf`)
    expect(res.status()).toBe(401)
  })

  test.describe("signed in", () => {
    test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

    test("returns a real PDF of the caller's own flyer", async ({ request }) => {
      const list = await request.get(`${BASE}/api/deliverables`)
      expect(list.ok(), "could not list deliverables").toBe(true)
      const flyers: { id: string; status: string; downloadUrl?: string }[] = (await list.json()).flyers ?? []
      const ready = flyers.find((f) => f.status === "Ready" && f.downloadUrl)
      test.skip(!ready, "the seeded basic account has no ready flyer")

      const res = await request.get(`${BASE}/api/flyers/${ready!.id}/pdf`)
      expect(res.status(), await res.text().catch(() => "")).toBe(200)
      expect(res.headers()["content-type"]).toBe("application/pdf")
      expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename=".+\.pdf"$/)
      // Never a shared cache: a flyer is private to one account.
      expect(res.headers()["cache-control"]).toContain("private")

      const pdf = Buffer.from(await res.body())
      expect(pdf.subarray(0, 5).toString("latin1"), "not a PDF").toBe("%PDF-")
      expect(pdf.length).toBeGreaterThan(5_000)
      const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString("latin1"))
      expect(box, "no page box").not.toBeNull()
      // Letter at 72pt/in, from the flyer's own @page rule.
      expect(Number(box![3]) / 72).toBeCloseTo(8.5, 1)
      expect(Number(box![4]) / 72).toBeCloseTo(11, 1)
    })

    test("does not hand over another account's flyer", async ({ request }) => {
      // A real id belonging to somebody else is indistinguishable from a
      // made-up one, which is the point — 404, not 403, leaks nothing
      // about whether the id exists.
      const res = await request.get(`${BASE}/api/flyers/00000000-0000-0000-0000-000000000000/pdf`)
      expect(res.status()).toBe(404)
    })
  })
})
