import { ADMIN_SUB } from "./auth"
import { getClient } from "./store"

// Shared by app/admin/layout.tsx (page access) and every /api/admin/*
// route (data access) — a valid session isn't necessarily an admin one.
// Lives in its own file rather than lib/auth.ts to avoid a circular import:
// lib/store.ts already imports sha256Hex from lib/auth.ts, so lib/auth.ts
// importing getClient from lib/store.ts would create a cycle.
export async function isAdminSession(sub: string | null | undefined): Promise<boolean> {
  if (!sub) return false
  if (sub === ADMIN_SUB) return true
  const client = await getClient(sub)
  return client?.isAdmin ?? false
}
