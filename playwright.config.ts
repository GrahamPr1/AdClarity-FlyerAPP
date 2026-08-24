import { defineConfig, devices } from "@playwright/test"

// Cross-engine tests live in tests/browser and are kept OUT of the vitest run
// (vitest only picks up tests/**/*.test.ts).
//
// Specs that need an authenticated admin depend on a per-engine "setup"
// project which signs in once and saves the session. Sign-in is rate-limited
// per account, so authenticating inside every test tripped that limiter on
// repeated runs — see tests/browser/auth.setup.ts.
const ENGINES = [
  { name: "chromium", device: devices["Desktop Chrome"] },
  { name: "firefox", device: devices["Desktop Firefox"] },
  { name: "webkit", device: devices["Desktop Safari"] },
] as const

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/global-setup.ts",
  fullyParallel: true,
  reporter: [["list"]],
  // WebKit against the Next dev server runs several times slower than
  // Chromium and all three engines run at once, so 30s is tight under load.
  // Deliberately NOT set higher than this: when these tests were failing, a
  // longer timeout only made a hung login take longer to report. The real
  // cause was sign-in throttling, fixed by reusing sessions and by having
  // `npm run test:browser` clear the throttle buckets first.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  projects: [
    ...ENGINES.map((e) => ({
      name: `setup-${e.name}`,
      use: { ...e.device },
      testMatch: /auth\.setup\.ts/,
    })),
    ...ENGINES.map((e) => ({
      name: e.name,
      use: { ...e.device },
      testIgnore: /auth\.setup\.ts/,
      dependencies: [`setup-${e.name}`],
    })),
  ],
})
