/**
 * Escapes Redis glob metacharacters so an identifier is matched literally.
 *
 * Lives in its own module because lib/store.ts constructs a Redis client at
 * import time and therefore can't be unit-tested — and this function guards a
 * DELETE path, which is the last place to rely on manual verification.
 *
 * SCAN MATCH is a glob, not a literal comparison. An account id containing
 * `*`, `?` or a `[...]` class would otherwise widen the pattern and sweep in
 * OTHER accounts' keys, destroying data belonging to someone else. Not
 * hypothetical: the live database holds records whose "email" is a bare
 * string like `test`, so ids are not guaranteed to be well-formed addresses.
 */
export function escapeRedisGlob(value: string): string {
  return value.replace(/[[\]*?\\^]/g, (ch) => `\\${ch}`)
}
