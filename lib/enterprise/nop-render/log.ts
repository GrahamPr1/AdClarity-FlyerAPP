import { Redis } from "@upstash/redis"
import type { NopFormat } from "./render"

// NOP generation log — a COMPLIANCE RECORD. The Basic Benefits contract
// requires exporting it at termination, so nothing here is ever trimmed,
// expired or capped:
//
//   nop-render-log            every entry, newest first (global index)
//   nop-render-log:{agentId}  that agent's complete history, newest first
//
// Every download (print/home/social) is logged, and every preview as
// format "preview". Entries are written only after the file has passed
// every gate, i.e. for files that were actually returned.

const redis = Redis.fromEnv()
const GLOBAL_KEY = "nop-render-log"
const agentKey = (agentId: string) => `nop-render-log:${agentId}`

export interface NopRenderLogEntry {
  agentId: string
  /** The OneFlyer account that asked for it. */
  account: string
  template: string
  format: NopFormat
  kitVersion: string
  /**
   * The content version (prices, effective date) the file was rendered
   * with: "c{n}" for an uploaded version, "bundled-{kit}" for the content.json
   * shipped with the code. Absent on entries written before versioning,
   * which all used the bundled content.
   */
  contentVersion?: string
  /** ISO timestamp. */
  at: string
}

export async function logNopRender(entry: Omit<NopRenderLogEntry, "at">): Promise<NopRenderLogEntry> {
  const full: NopRenderLogEntry = { ...entry, at: new Date().toISOString() }
  await Promise.all([redis.lpush(GLOBAL_KEY, full), redis.lpush(agentKey(entry.agentId), full)])
  return full
}

/** Newest first. Without a limit, the complete log. */
export async function listNopRenders(opts: { agentId?: string; limit?: number } = {}): Promise<NopRenderLogEntry[]> {
  const key = opts.agentId ? agentKey(opts.agentId) : GLOBAL_KEY
  const stop = opts.limit ? opts.limit - 1 : -1
  return redis.lrange<NopRenderLogEntry>(key, 0, stop)
}

export async function countNopRenders(agentId?: string): Promise<number> {
  return redis.llen(agentId ? agentKey(agentId) : GLOBAL_KEY)
}

const CSV_COLUMNS = ["timestamp", "agent_id", "account", "template", "format", "kit_version", "content_version"] as const

/** RFC 4180 CSV of the log, oldest first (the order an auditor reads it). */
export function nopRenderLogCsv(entries: NopRenderLogEntry[]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rows = [CSV_COLUMNS.join(",")]
  for (const e of [...entries].reverse()) rows.push([e.at, e.agentId, e.account, e.template, e.format, e.kitVersion, e.contentVersion ?? `bundled-${e.kitVersion}`].map((v) => q(String(v))).join(","))
  return rows.join("\r\n") + "\r\n"
}
