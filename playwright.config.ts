import { defineConfig, devices } from "@playwright/test"

// Cross-engine tests live in tests/browser and are kept OUT of the vitest run
// (vitest only picks up tests/**/*.test.ts). They spin up their own local
// server, so they need no dev server and no credentials.
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  reporter: [["list"]],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
})
