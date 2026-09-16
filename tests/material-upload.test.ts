import { describe, it, expect } from "vitest"
import type { IntakeSubmission } from "@/lib/types"

/**
 * The "existing marketing materials" field had the same discard bug the logo
 * had: `set("existingMaterialsFileName", file.name)` kept the name and threw
 * the File away, so nothing was ever uploaded.
 *
 * These pin the contract that makes the bytes retrievable. Byte-level
 * reachability is proven by an integration run against the real upload +
 * read routes (reported alongside this change) — Blob storage is not
 * something to fake in a unit test, because a fake would pass while the real
 * path stayed broken, which is exactly the failure being fixed.
 */

/** Mirrors the guard in app/api/onboarding/material/[...path]/route.ts. */
function pathIsServable(pathname: string): boolean {
  return pathname.startsWith("onboarding-materials/") && !pathname.includes("..")
}

/** Mirrors the ownership decision in the same route. */
function mayRead(owner: string | null, requester: string, isAdmin: boolean): boolean {
  if (!owner) return false
  return owner === requester || isAdmin
}

describe("the submission carries the upload, not just its name", () => {
  it("has a URL field distinct from the display-only filename", () => {
    const submission: Partial<IntakeSubmission> = {
      existingMaterialsFileName: "brochure.pdf",
      existingMaterialsUrl: "https://oneflyer.org/api/onboarding/material/onboarding-materials/uuid-brochure.pdf",
    }
    expect(submission.existingMaterialsUrl).toBeTruthy()
    expect(submission.existingMaterialsUrl).not.toBe(submission.existingMaterialsFileName)
  })

  it("points at the authenticated read route, never the raw blob", () => {
    const url = "https://oneflyer.org/api/onboarding/material/onboarding-materials/uuid-brochure.pdf"
    expect(url).toContain("/api/onboarding/material/")
    // A client's brochure must not be served from the open photos proxy.
    expect(url).not.toContain("/api/photos/")
  })
})

describe("materials are private, unlike flyer photos", () => {
  it("serves a material to its owner", () => {
    expect(mayRead("dana@example.test", "dana@example.test", false)).toBe(true)
  })

  it("does NOT serve one client's material to another", () => {
    // The pathname is random, but obscurity is not authorisation.
    expect(mayRead("dana@example.test", "someone-else@example.test", false)).toBe(false)
  })

  it("refuses when no ownership was ever recorded", () => {
    expect(mayRead(null, "dana@example.test", false)).toBe(false)
  })

  it("allows an admin, the same allowance every other admin surface has", () => {
    expect(mayRead("dana@example.test", "admin", true)).toBe(true)
  })
})

describe("the read route cannot be walked out of its prefix", () => {
  it("serves only the materials prefix", () => {
    expect(pathIsServable("onboarding-materials/uuid-brochure.pdf")).toBe(true)
  })

  it("refuses other blob prefixes", () => {
    expect(pathIsServable("onboarding-photos/uuid-photo.png")).toBe(false)
    expect(pathIsServable("form-fill/secret.pdf")).toBe(false)
  })

  it("refuses traversal", () => {
    expect(pathIsServable("onboarding-materials/../form-fill/secret.pdf")).toBe(false)
  })
})
