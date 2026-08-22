#!/usr/bin/env node
/**
 * Local development Redis endpoint.
 *
 * @upstash/redis talks HTTP, not the Redis wire protocol, so a locally
 * installed redis-server can't be used directly. This is a thin bridge: it
 * speaks Upstash's REST shape on the front and the real Redis protocol on the
 * back, so development runs against GENUINE Redis semantics (real INCRBY
 * atomicity, real SCAN cursors, real TTLs) rather than a hand-rolled
 * imitation that could drift from production behaviour.
 *
 * This exists because development and production were sharing one hosted
 * Upstash instance. Provisioning a second hosted database needs an
 * interactive marketplace step; this gives real isolation today without one,
 * and nothing here runs in or affects production.
 *
 *   npm run dev:redis      start it (foreground)
 *
 * Auth: requires the same bearer token the app is configured with, so a stray
 * process on the machine can't read the dev database by accident. Binds to
 * 127.0.0.1 only — never reachable off the machine.
 */
import http from "node:http"
import net from "node:net"

const PORT = Number(process.env.DEV_REDIS_HTTP_PORT || 8079)
const REDIS_PORT = Number(process.env.DEV_REDIS_PORT || 6379)
const REDIS_HOST = process.env.DEV_REDIS_HOST || "127.0.0.1"
const TOKEN = process.env.DEV_REDIS_TOKEN || "local-dev-token"

/** Encode one command as a RESP array. */
function encode(args) {
  let out = `*${args.length}\r\n`
  for (const a of args) {
    const s = String(a)
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`
  }
  return out
}

/** Minimal RESP parser — returns [value, bytesConsumed] or null if incomplete. */
function parse(buf, i = 0) {
  if (i >= buf.length) return null
  const type = buf[i]
  const nl = buf.indexOf("\r\n", i)
  if (nl === -1) return null
  const head = buf.slice(i + 1, nl)

  if (type === 0x2b) return [head.toString(), nl + 2] // +simple
  if (type === 0x2d) return [{ error: head.toString() }, nl + 2] // -error
  if (type === 0x3a) return [Number(head), nl + 2] // :integer
  if (type === 0x24) {
    // $bulk
    const len = Number(head)
    if (len === -1) return [null, nl + 2]
    const start = nl + 2
    if (buf.length < start + len + 2) return null
    return [buf.slice(start, start + len).toString(), start + len + 2]
  }
  if (type === 0x2a) {
    // *array
    const count = Number(head)
    if (count === -1) return [null, nl + 2]
    let pos = nl + 2
    const items = []
    for (let n = 0; n < count; n++) {
      const r = parse(buf, pos)
      if (!r) return null
      items.push(r[0])
      pos = r[1]
    }
    return [items, pos]
  }
  return null
}

function sendCommand(args) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: REDIS_HOST, port: REDIS_PORT }, () => sock.write(encode(args)))
    let buf = Buffer.alloc(0)
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d])
      const r = parse(buf)
      if (r) {
        sock.end()
        resolve(r[0])
      }
    })
    sock.on("error", reject)
  })
}

/**
 * Upstash stores values as strings and the SDK JSON-parses on read. Objects
 * handed to SET therefore have to be serialized here the same way, or reads
 * come back as "[object Object]".
 */
/**
 * Upstash's REST API supports `Upstash-Encoding: base64`, and @upstash/redis
 * sends that header on every request and base64-DECODES what comes back.
 * A bridge that returns raw strings therefore gets its values mangled — the
 * SDK decodes "development" as if it were base64 and yields binary noise.
 * Encode string results (including inside arrays, e.g. SCAN) to match.
 */
function encodeResult(value) {
  if (typeof value === "string") return Buffer.from(value, "utf8").toString("base64")
  if (Array.isArray(value)) return value.map(encodeResult)
  return value
}

function normalizeArgs(cmd) {
  return cmd.map((part) => (typeof part === "object" && part !== null ? JSON.stringify(part) : part))
}

const server = http.createServer(async (req, res) => {
  const auth = req.headers.authorization
  if (auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Unauthorized" }))
    return
  }

  // Honour the SDK's requested response encoding (see encodeResult).
  const wantsBase64 = String(req.headers["upstash-encoding"] || "").toLowerCase() === "base64"

  let body = ""
  for await (const chunk of req) body += chunk

  try {
    const payload = body ? JSON.parse(body) : []
    // Upstash accepts a single command ["GET","k"] or a pipeline [[..],[..]].
    const isPipeline = Array.isArray(payload[0])
    const commands = isPipeline ? payload : [payload]
    const results = []
    for (const cmd of commands) {
      const result = await sendCommand(normalizeArgs(cmd))
      results.push(
        result && typeof result === "object" && !Array.isArray(result) && "error" in result
          ? { error: result.error }
          : { result: wantsBase64 ? encodeResult(result) : result },
      )
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(isPipeline ? results : results[0]))
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "error" }))
  }
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`dev redis REST bridge -> redis://${REDIS_HOST}:${REDIS_PORT}`)
  console.log(`listening on http://127.0.0.1:${PORT} (loopback only)`)
})
