import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import type { ZodType } from "zod"

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
}): Promise<import("zod").infer<T>> {
  const anthropic = getClient()

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.systemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify(opts.userInput, null, 2),
      },
    ],
    output_config: {
      format: zodOutputFormat(opts.schema),
    },
  })

  const message = await stream.finalMessage()

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
