import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { ZodType } from "zod"
import type { GenerationAgentType } from "@/lib/types"
import { recordGenerationLogEntry } from "@/lib/store"
import { estimateCostUsd } from "./pricing"

const MODEL = process.env.ADCLARITY_MODEL ?? "claude-sonnet-5"

let client: Anthropic | undefined

function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set on the server.")
    }
    client = new Anthropic()
  }
  return client
}

export class AgentRefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AgentRefusalError"
  }
}

export class AgentTruncatedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AgentTruncatedError"
  }
}

/**
 * The model's JSON arrived incomplete for a reason that is NOT the token
 * ceiling — most often a stream that ended early.
 *
 * Distinct from AgentTruncatedError on purpose: the two want opposite
 * responses. A genuine max_tokens truncation means the response was too big
 * and retrying it unchanged will produce the same too-big response, which is
 * why flyerAgent.ts deliberately raises the ceiling instead of retrying.
 * An interrupted stream means the response never got the chance to finish,
 * and retrying IS the correct response.
 */
/**
 * The model returned syntactically valid JSON that the schema refused.
 *
 * Distinct from AgentIncompleteError because the responses differ: an
 * incomplete stream is worth retrying, a schema violation is not — the model
 * answered as well as it could and the CONTRACT is what rejected it. Retrying
 * just pays for the same rejection twice. The message carries Zod's own
 * issue list, which names the offending field.
 */
export class AgentSchemaError extends Error {
  readonly stopReason: string | null
  readonly charsReceived: number
  constructor(message: string, detail: { stopReason: string | null; charsReceived: number }) {
    super(message)
    this.name = "AgentSchemaError"
    this.stopReason = detail.stopReason
    this.charsReceived = detail.charsReceived
  }
}

export class AgentIncompleteError extends Error {
  readonly stopReason: string | null
  readonly charsReceived: number
  readonly tail: string

  constructor(message: string, detail: { stopReason: string | null; charsReceived: number; tail: string }) {
    super(message)
    this.name = "AgentIncompleteError"
    this.stopReason = detail.stopReason
    this.charsReceived = detail.charsReceived
    this.tail = detail.tail
  }
}

export interface GenerationLogContext {
  email: string
  agentType: GenerationAgentType
  /** Null when this call doesn't map to exactly one flyer — the Intake/Brand stages (no flyer id exists yet) or a Flyer Agent batch of more than one. */
  flyerId?: string | null
}

async function runStream<T extends ZodType>(opts: {
  systemPrompt: string
  content: Anthropic.Messages.MessageParam["content"]
  schema: T
  maxTokens?: number
  logContext?: GenerationLogContext
}): Promise<import("zod").infer<T>> {
  const anthropic = getClient()

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.content }],
    output_config: {
      format: zodOutputFormat(opts.schema),
    },
  })

  // Raw accumulation, kept alongside the SDK's own parsing.
  //
  // The SDK parses structured output INSIDE finalMessage(), so when the
  // model's JSON is incomplete the parse error is thrown before any of the
  // stop_reason checks below can run. That made every truncated or
  // interrupted response surface as an opaque
  // "Unterminated string in JSON at position N" with no indication of
  // whether it was a token limit, a dropped stream, or a real model fault —
  // which is exactly the state this diagnosis started from.
  let rawText = ""
  let lastStopReason: string | null = null
  stream.on("text", (_delta, snapshot) => { rawText = snapshot })
  stream.on("streamEvent", (_event, snapshot) => {
    if (snapshot?.stop_reason) lastStopReason = snapshot.stop_reason
  })

  let message: Awaited<ReturnType<typeof stream.finalMessage>>
  try {
    message = await stream.finalMessage()
  } catch (err) {
    // The SDK uses two DIFFERENT errors that both start "Failed to parse
    // structured output", and conflating them hides the more common one:
    //
    //   "...as JSON: <syntax error>"  the bytes are not valid JSON
    //   "...: <zod message>"          valid JSON that violates the schema
    //
    // Only the first is an incomplete response. A schema violation means the
    // model answered coherently and the SCHEMA rejected it — a completely
    // different problem with a completely different fix, and re-running it
    // will produce the same rejection.
    const msg = err instanceof Error ? err.message : String(err)
    const jsonBroken = /Failed to parse structured output as JSON/i.test(msg)
    const schemaRejected = !jsonBroken && /Failed to parse structured output/i.test(msg)
    if (schemaRejected) {
      throw new AgentSchemaError(msg, { stopReason: lastStopReason, charsReceived: rawText.length })
    }
    if (!jsonBroken) throw err

    // Now the useful question can actually be answered.
    if (lastStopReason === "max_tokens") {
      throw new AgentTruncatedError(
        `Response was cut off at the ${opts.maxTokens ?? 4096}-token ceiling after ${rawText.length} characters; retry with higher max_tokens.`,
      )
    }
    throw new AgentIncompleteError(
      `Model returned incomplete JSON (stop_reason: ${lastStopReason ?? "none"}, ${rawText.length} chars received).`,
      { stopReason: lastStopReason, charsReceived: rawText.length, tail: rawText.slice(-200) },
    )
  }

  // Logged before the refusal/truncation/null checks below, which throw —
  // a refused or truncated response still consumed real input/output
  // tokens and cost real money, so it still needs a row. Never blocks or
  // fails the actual agent call on a logging error: cost tracking is
  // secondary to the product working.
  if (opts.logContext) {
    const { email, agentType, flyerId } = opts.logContext
    recordGenerationLogEntry({
      email,
      agentType,
      flyerId: flyerId ?? null,
      model: MODEL,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      estimatedCostUsd: estimateCostUsd(MODEL, message.usage.input_tokens, message.usage.output_tokens),
      createdAt: new Date().toISOString(),
    }).catch((err) => console.error("[generation-log] Failed to record usage:", err instanceof Error ? err.message : err))
  }

  // Early warning for the failure class this check exists because of.
  //
  // A ceiling that is too low does not announce itself: it shows up later as
  // an unparseable-JSON error in a completely different part of the app. What
  // it DOES do first is push the output-token distribution up against the
  // limit. Three agents (polish at 2048, intake and scrape on the 4096
  // default) were found sitting with max === ceiling exactly, which is only
  // possible when responses are being clipped.
  //
  // Warning at 80% means the next person sees "getting close" in the logs
  // before any client sees a failed flyer.
  const ceiling = opts.maxTokens ?? 4096
  if (message.usage.output_tokens >= ceiling * 0.8) {
    console.warn(
      `[agent-pipeline] ${opts.logContext?.agentType ?? "agent"} used ${message.usage.output_tokens}/${ceiling} output tokens ` +
        `(${Math.round((message.usage.output_tokens / ceiling) * 100)}% of its ceiling) — raise maxTokens before this starts truncating.`,
    )
  }

  if (message.stop_reason === "refusal") {
    throw new AgentRefusalError("Model refused the request; output does not match schema.")
  }

  if (message.stop_reason === "max_tokens") {
    throw new AgentTruncatedError("Response was cut off before completion; retry with higher max_tokens.")
  }

  if (message.parsed_output === null) {
    throw new Error(`No structured output returned (stop_reason: ${message.stop_reason})`)
  }

  return message.parsed_output
}

/**
 * Runs a single-turn JSON-producing agent call with guaranteed schema
 * compliance via Anthropic's native Structured Outputs (output_config.format).
 * The schema is compiled into a grammar that constrains which tokens the
 * model can generate, so the shape-drift failures prose-based "return JSON
 * matching X" instructions were prone to are no longer possible.
 *
 * Uses streaming rather than a single blocking call: the SDK refuses
 * non-streaming requests whose max_tokens implies a worst case over ~10
 * minutes (max_tokens > ~21,333 at this model's throughput estimate) — a
 * real limit hit when batching several flyers' full HTML in one call.
 * finalMessage() returns the same ParsedMessage shape .parse() would.
 */
export async function runJsonAgent<T extends ZodType>(opts: {
  systemPrompt: string
  userInput: unknown
  schema: T
  maxTokens?: number
  logContext: GenerationLogContext
}): Promise<import("zod").infer<T>> {
  const call = () =>
    runStream({
      systemPrompt: opts.systemPrompt,
      content: JSON.stringify(opts.userInput, null, 2),
      schema: opts.schema,
      maxTokens: opts.maxTokens,
      logContext: opts.logContext,
    })

  try {
    return await call()
  } catch (err) {
    // Retried for AgentIncompleteError ONLY — a stream that ended early.
    //
    // Deliberately NOT for AgentTruncatedError, preserving the decision
    // documented in flyerAgent.ts: a max_tokens truncation means the response
    // was too big, so re-running it unchanged produces the same too-big
    // response while doubling wall-clock against PIPELINE_TIMEOUT_MS. The
    // fix for that is a correct ceiling, not a retry.
    //
    // An interrupted stream is the opposite case: the response never got to
    // finish, the failure is cheap (it died early, by definition), and a
    // fresh attempt is the only sensible response. Exactly one retry, so a
    // persistent fault still surfaces instead of looping.
    if (!(err instanceof AgentIncompleteError)) throw err
    console.warn(
      `[agent-pipeline] ${opts.logContext.agentType}: incomplete response after ${err.charsReceived} chars ` +
        `(stop_reason: ${err.stopReason ?? "none"}) — retrying once.`,
    )
    return await call()
  }
}

const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const

export interface DocumentInput {
  /** Raw file bytes, base64-encoded. */
  base64: string
  /** PDFs read as native document blocks; images (e.g. a scanned form or photo) as native image blocks. */
  mediaType: "application/pdf" | (typeof IMAGE_MEDIA_TYPES)[number]
}

/**
 * Same guarantees as runJsonAgent, but for calls that need Claude to read
 * actual file content (currently: PDF form-filling) rather than just a JSON
 * payload — passes each document/image as a native content block ahead of
 * the JSON instructions, so Claude reads the real file bytes rather than
 * being told about them secondhand.
 */
export async function runJsonAgentWithDocuments<T extends ZodType>(opts: {
  systemPrompt: string
  userInput: unknown
  documents: DocumentInput[]
  schema: T
  maxTokens?: number
  /** Optional only because form-fill predates the generation log. Intake
   *  passes it, so attaching a business-profile PDF does not silently drop
   *  intake out of per-agent cost reporting. */
  logContext?: GenerationLogContext
}): Promise<import("zod").infer<T>> {
  const content: Anthropic.Messages.MessageParam["content"] = [
    ...opts.documents.map((doc) =>
      (IMAGE_MEDIA_TYPES as readonly string[]).includes(doc.mediaType)
        ? { type: "image" as const, source: { type: "base64" as const, media_type: doc.mediaType as (typeof IMAGE_MEDIA_TYPES)[number], data: doc.base64 } }
        : { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: doc.base64 } },
    ),
    { type: "text" as const, text: JSON.stringify(opts.userInput, null, 2) },
  ]

  return runStream({
    systemPrompt: opts.systemPrompt,
    content,
    schema: opts.schema,
    maxTokens: opts.maxTokens,
    logContext: opts.logContext,
  })
}
