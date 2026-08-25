import { test, expect } from "@playwright/test"
import { PNG } from "pngjs"
import { stateFile } from "./auth-paths"

/**
 * Photo upload is the one place a client hands us a real file, and it spans
 * four things that can each fail independently: the multipart POST, Vercel
 * Blob storage, the read-back proxy at /api/photos/[...path], and the form
 * state that has to carry the resulting URL into the campaign.
 *
 * Requires `npm run seed:dev` and a BLOB_READ_WRITE_TOKEN.
 */

function pngBytes(width = 24, height = 24): Buffer {
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 200
    png.data[i + 1] = 90
    png.data[i + 2] = 40
    png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}

const BASE = "http://localhost:3000"

test.describe("signed in as a client", () => {
  // `provide`, not `use` — a param named `use` trips the react-hooks lint rule.
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

test("uploads a real photo, stores it, and serves it back", async ({ page }) => {

  const res = await page.request.fetch(`${BASE}/api/onboarding/upload-photo`, {
    method: "POST",
    multipart: { file: { name: "storefront.png", mimeType: "image/png", buffer: pngBytes() } },
  })
  expect(res.status(), await res.text()).toBe(200)

  const { ok, url } = await res.json()
  expect(ok).toBe(true)
  expect(url).toContain("/api/photos/onboarding-photos/")
  // Must be absolute — it gets embedded in a data: URI flyer with no origin
  // to resolve a relative path against.
  expect(url).toMatch(/^https?:\/\//)
  // Must not leak who uploaded it: the proxy is deliberately unauthenticated.
  expect(url).not.toContain("@")

  // Read it back through the proxy, on the SAME path the flyer HTML will use.
  const proxied = await page.request.get(`${BASE}${new URL(url).pathname}`)
  expect(proxied.status()).toBe(200)
  expect(proxied.headers()["content-type"]).toContain("image")
  const bytes = await proxied.body()
  expect(bytes.length).toBeGreaterThan(0)
  // Really a PNG, not an error page with a 200.
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")

  // And it actually renders in a browser.
  await page.setContent(`<img id="p" src="${url}">`)
  const loaded = await page.locator("#p").evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
  expect(loaded, "uploaded photo should render").toBe(true)
})

test("rejects a non-image and an oversized file", async ({ page }) => {

  const notImage = await page.request.fetch(`${BASE}/api/onboarding/upload-photo`, {
    method: "POST",
    multipart: { file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } },
  })
  expect(notImage.status()).toBe(422)

  const tooBig = await page.request.fetch(`${BASE}/api/onboarding/upload-photo`, {
    method: "POST",
    multipart: { file: { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(11 * 1024 * 1024, 1) } },
  })
  expect(tooBig.status()).toBe(422)
})

})

test("refuses an unauthenticated upload", async ({ request }) => {
  const res = await request.fetch(`${BASE}/api/onboarding/upload-photo`, {
    method: "POST",
    multipart: { file: { name: "x.png", mimeType: "image/png", buffer: pngBytes(4, 4) } },
  })
  expect(res.status()).toBe(401)
})

test.describe("the form path, signed in as a client", () => {
  test.use({ storageState: ({}, provide, testInfo) => provide(stateFile("basic", testInfo.project.name)) })

// The API tests above prove the endpoint. This proves the path a real client
// takes: pick a file in the form, see it accepted, and have the URL carried
// into the submission rather than silently dropped.
test("the onboarding form uploads a chosen photo and shows the thumbnail", async ({ page }) => {

  await page.goto(`${BASE}/onboarding`)
  await page.getByRole("button", { name: /Guided Setup/i }).click()
  await page.getByRole("button", { name: /No, I'll answer a few questions/i }).click()

  await expect(page.getByText(/STEP 1 OF 3/i)).toBeVisible({ timeout: 20000 })
  await page.getByRole("button", { name: /^Contractor$/ }).click()
  await page.getByLabel(/business name/i).fill("Miller Heating & Air")
  await page.getByLabel(/what do you do/i).fill("HVAC repair and installation")
  await page.getByLabel(/^Service 1$/).fill("Furnace repair")
  await page.getByRole("button", { name: /^Continue$/ }).click()

  await expect(page.getByText(/STEP 2 OF 3/i)).toBeVisible({ timeout: 20000 })
  await page.getByLabel(/what are you promoting/i).fill("$500 off a new furnace")
  await page.getByLabel(/who are you trying to reach/i).fill("Homeowners")
  await page.getByRole("button", { name: /^Continue$/ }).click()

  await expect(page.getByText(/STEP 3 OF 3/i)).toBeVisible({ timeout: 20000 })
  // The photo field lives in the collapsed optional section.
  await page.getByRole("group").filter({ hasText: /photos|reference material/i }).first().click()

  await page.getByLabel(/Your own photos/i).setInputFiles({
    name: "storefront.png",
    mimeType: "image/png",
    buffer: pngBytes(32, 32),
  })

  // The thumbnail only appears once the upload really came back with a URL.
  const thumb = page.getByAltText(/Uploaded flyer photo/i)
  await expect(thumb).toBeVisible({ timeout: 30000 })

  // Re-query inside the browser on every poll rather than holding a locator
  // handle: React re-renders this list when the upload resolves, which
  // detaches the earlier element and makes a retained handle throw instead of
  // retrying. Also note toBeVisible() above is satisfied by the CSS box,
  // which exists before the image bytes arrive — hence waiting for the
  // decode, not just the element.
  await page.waitForFunction(
    () => {
      const img = document.querySelector<HTMLImageElement>('img[alt="Uploaded flyer photo"]')
      return !!img && img.complete && img.naturalWidth > 0
    },
    undefined,
    { timeout: 30000 },
  )

  await expect(page.getByText(/Uploading…/i)).toHaveCount(0)
  // An empty role="alert" live region is always present by design, so assert
  // on its TEXT — asserting the element is absent would fail on a clean run.
  expect((await page.getByRole("alert").allInnerTexts()).join("").trim()).toBe("")
})
})
