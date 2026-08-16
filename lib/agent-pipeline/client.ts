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

  const message = await stream.finalMessage()

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
  return runStream({
    systemPrompt: opts.systemPrompt,
    content: JSON.stringify(opts.userInput, null, 2),
    schema: opts.schema,
    maxTokens: opts.maxTokens,
    logContext: opts.logContext,
  })
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
  })
}
