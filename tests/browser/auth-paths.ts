import path from "node:path"

/**
 * Saved-session paths, one per (role, engine).
 *
 * Not a spec file — Playwright forbids one test file importing another.
 *
 * Sessions are saved once by auth.setup.ts and reused, because sign-in is
 * rate-limited per account (10 per 10 minutes, see lib/rate-limit.ts). Specs
 * that log in per test burn that budget several times per run and start
 * failing on login timeouts that look like product bugs but aren't.
 */
export const ROLES = ["admin", "basic", "trial", "intake"] as const
export type Role = (typeof ROLES)[number]

/** The seeded account for a role on a given engine. See scripts/seed-dev-accounts.ts. */
export function accountFor(role: Role, project: string): string {
  return role === "admin" ? `admin-audit-${project}@dev.invalid` : `qr-${role}-${project}@dev.invalid`
}

export function stateFile(role: Role, project: string): string {
  return path.join("tests/browser/.auth", `${role}-${project}.json`)
}
