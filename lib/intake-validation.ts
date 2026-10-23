/**
 * Shape checks for an /api/intake body that the "missing fields" check can't
 * see. A wrong-shaped value isn't missing, so it used to sail through and
 * crash deep in the pipeline: `services: ["Furnace repair"]` (strings, not
 * { id, name } objects) reached `s.name.trim()` and answered 500.
 */

/** Generous: the onboarding form offers a handful; this only stops abuse. */
export const MAX_SERVICES = 50
export const MAX_SERVICE_NAME_CHARS = 200

/** Why `services` is malformed, or null if it's fine (or absent — "missing" is reported separately). */
export function servicesProblem(services: unknown): string | null {
  if (services === undefined || services === null) return null
  if (!Array.isArray(services)) return "services must be a list of { id, name } items"
  if (services.length > MAX_SERVICES) return `services can have at most ${MAX_SERVICES} items`
  for (const [i, item] of services.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return `services[${i}] must be an object with a name`
    const { id, name } = item as { id?: unknown; name?: unknown }
    if (typeof name !== "string") return `services[${i}].name must be text`
    if (name.length > MAX_SERVICE_NAME_CHARS) return `services[${i}].name is longer than ${MAX_SERVICE_NAME_CHARS} characters`
    if (id !== undefined && typeof id !== "string") return `services[${i}].id must be text`
  }
  return null
}
