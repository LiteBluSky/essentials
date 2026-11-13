import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { readSettings } from './settings.server'

// Server-only: talking to the LLM, shared by the Tell me field and the Chat
// app. Two providers (Settings › Provider): any OpenAI-compatible chat
// completions API (OpenRouter by default, plain fetch) or Anthropic's own
// API (the official SDK). A conversation is a list of neutral `Turn`s that
// each provider converts to its own format; every call returns the tool
// calls, the text and what it cost.

export type LlmProvider = 'openai' | 'anthropic'

const OPENROUTER = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL: Record<LlmProvider, string> = {
  openai: 'anthropic/claude-haiku-5.5',
  anthropic: 'claude-opus-5-5',
}

export type LlmConfig = {
  provider: LlmProvider
  key: string
  baseUrl: string
  model: string
}

/** The configured LLM, or null when there's no API key. */
export async function llmConfig(): Promise<LlmConfig | null> {
  const settings = await readSettings()
  if (!settings.LLM_API_KEY) return null
  const provider: LlmProvider =
    settings.LLM_PROVIDER === 'anthropic' ? 'anthropic' : 'openai'
  return {
    provider,
    key: settings.LLM_API_KEY,
    baseUrl: (settings.LLM_BASE_URL || OPENROUTER).replace(/\/+$/, ''),
    model: settings.LLM_MODEL || DEFAULT_MODEL[provider],
  }
}

export async function assistantConfigured() {
  return (await llmConfig()) !== null
}

/** The provider and model a request would use (for the history log). */
export async function currentModel() {
  const config = await llmConfig()
  return config && { provider: config.provider, model: config.model }
}

/** A tool, in a neutral shape: each provider wraps it its own way. */
export type ToolDef = {
  name: string
  description: string
  /** JSON schema of the arguments (an object). */
  parameters: Record<string, unknown>
}

export type ToolCall = { id: string; name: string; args: unknown }

/** One step of a conversation. An assistant turn keeps the provider's raw
 * content (Anthropic: its blocks, thinking included) to send back
 * unchanged within a tool loop. */
export type Turn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; calls: Array<ToolCall>; raw?: unknown }
  | { role: 'tool'; results: Array<{ id: string; content: string }> }

/** What a model call (or several, added up) cost. */
export type ModelUsage = {
  provider: LlmProvider
  model: string
  inputTokens: number | null
  outputTokens: number | null
  /** US dollars; null when unknown (no price for the model / provider). */
  costUsd: number | null
}

export type ModelReply = ModelUsage & {
  calls: Array<ToolCall>
  text: string
  raw?: unknown
}

/** `a` + `b` (tokens and cost; an unknown cost stays unknown). */
export function addUsage(a: ModelUsage | null, b: ModelUsage): ModelUsage {
  if (!a) return b
  const plus = (x: number | null, y: number | null) =>
    x === null || y === null ? null : x + y
  return {
    provider: b.provider,
    model: b.model,
    inputTokens: plus(a.inputTokens, b.inputTokens) ?? b.inputTokens,
    outputTokens: plus(a.outputTokens, b.outputTokens) ?? b.outputTokens,
    costUsd: plus(a.costUsd, b.costUsd),
  }
}

/** One call: the conversation so far in, the next assistant turn out. */
export function callModel(
  config: LlmConfig,
  request: { system: string; turns: Array<Turn>; tools: Array<ToolDef> },
): Promise<ModelReply> {
  return config.provider === 'anthropic'
    ? callAnthropic(config, request)
    : callOpenAi(config, request)
}

// ---- OpenAI-compatible -------------------------------------------------------

const completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().nullish(),
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
  model: z.string().nullish(),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
      // OpenRouter: what the request cost, in credits (= US dollars).
      cost: z.number().nullish(),
    })
    .nullish(),
})

function toOpenAi(turns: Array<Turn>) {
  return turns.flatMap((turn): Array<Record<string, unknown>> => {
    if (turn.role === 'user') return [{ role: 'user', content: turn.text }]
    if (turn.role === 'tool') {
      return turn.results.map((result) => ({
        role: 'tool',
        tool_call_id: result.id,
        content: result.content,
      }))
    }
    return [
      {
        role: 'assistant',
        content: turn.text || null,
        ...(turn.calls.length && {
          tool_calls: turn.calls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        }),
      },
    ]
  })
}

async function callOpenAi(
  config: LlmConfig,
  { system, turns, tools }: Parameters<typeof callModel>[1],
): Promise<ModelReply> {
  const openRouter = new URL(config.baseUrl).hostname.endsWith('openrouter.ai')
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'system', content: system }, ...toOpenAi(turns)],
      // Not 'required': the newest Claude models reject a forced tool call.
      // The prompts ask for one instead. No temperature either: Anthropic's
      // current API version rejects it. (A plain call has no tools.)
      ...(tools.length > 0 && {
        tools: tools.map((tool) => ({ type: 'function', function: tool })),
        tool_choice: 'auto',
      }),
      // OpenRouter reports the request's cost in `usage.cost`.
      ...(openRouter && { usage: { include: true } }),
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`The LLM answered ${res.status}: ${detail}`)
  }
  const body = completion.parse(await res.json())
  const { message } = body.choices[0]
  return {
    provider: 'openai',
    model: body.model || config.model,
    inputTokens: body.usage?.prompt_tokens ?? null,
    outputTokens: body.usage?.completion_tokens ?? null,
    costUsd: body.usage?.cost ?? null,
    text: message.content ?? '',
    calls: (message.tool_calls ?? []).flatMap((call, i) => {
      try {
        return [
          {
            id: call.id || `call_${i}`,
            name: call.function.name,
            args: JSON.parse(call.function.arguments || '{}') as unknown,
          },
        ]
      } catch {
        return []
      }
    }),
  }
}

// ---- Anthropic ---------------------------------------------------------------

/** Anthropic's prices per million tokens (input, output), in US dollars.
 * Unlisted models get no cost. */
const ANTHROPIC_PRICES: Partial<Record<string, [number, number]>> = {
  'claude-fable-5-2': [8, 40],
  'claude-fable-5-1': [10, 50],
  'claude-fable-5': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
}

function anthropicCost(model: string, input: number, output: number) {
  const price = ANTHROPIC_PRICES[model]
  if (!price) return null
  return (input * price[0] + output * price[1]) / 1_000_000
}

/** Models that take `output_config.effort`, and those that accept the
 * server-side refusal fallback. */
const TAKES_EFFORT = /^claude-(opus|sonnet|haiku|fable|mythos)-5/
const TAKES_FALLBACK = /^claude-(fable-5-[12]|opus-5|sonnet-5-5)/

function toAnthropic(
  turns: Array<Turn>,
): Array<Anthropic.Beta.BetaMessageParam> {
  return turns.flatMap((turn): Array<Anthropic.Beta.BetaMessageParam> => {
    if (turn.role === 'user') return [{ role: 'user', content: turn.text }]
    if (turn.role === 'tool') {
      // All of a turn's results go back in one user message.
      return [
        {
          role: 'user',
          content: turn.results.map((result) => ({
            type: 'tool_result' as const,
            tool_use_id: result.id,
            content: result.content,
          })),
        },
      ]
    }
    // Within a tool loop, the blocks go back unchanged (thinking included);
    // earlier, saved turns are just their text.
    if (turn.raw) {
      return [
        {
          role: 'assistant',
          content: turn.raw,
        } as Anthropic.Beta.BetaMessageParam,
      ]
    }
    return turn.text ? [{ role: 'assistant', content: turn.text }] : []
  })
}

async function callAnthropic(
  config: LlmConfig,
  { system, turns, tools }: Parameters<typeof callModel>[1],
): Promise<ModelReply> {
  const client = new Anthropic({ apiKey: config.key, timeout: 90_000 })
  const fallback = TAKES_FALLBACK.test(config.model)
  const response = await client.beta.messages.create({
    model: config.model,
    max_tokens: 16000,
    system,
    messages: toAnthropic(turns),
    // tool_choice stays auto (forcing a call is rejected by the newest
    // models); the prompts say when to call a tool.
    ...(tools.length > 0 && {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema:
          tool.parameters as Anthropic.Beta.BetaTool['input_schema'],
      })),
    }),
    // Look-ups and short answers: little thinking needed.
    ...(TAKES_EFFORT.test(config.model) && {
      output_config: { effort: 'low' as const },
    }),
    // If a safety classifier declines, another model answers instead.
    ...(fallback && {
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default' as const,
    }),
  })
  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to answer that')
  }

  // Price each model that ran (a fallback model bills at its own rates).
  const usage = response.usage
  const hops = usage.iterations?.length
    ? usage.iterations.map((hop) => ({
        model: ('model' in hop ? hop.model : null) ?? config.model,
        input:
          hop.input_tokens +
          hop.cache_creation_input_tokens +
          hop.cache_read_input_tokens,
        output: hop.output_tokens,
      }))
    : [
        {
          model: response.model,
          input:
            usage.input_tokens +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0),
          output: usage.output_tokens,
        },
      ]
  const costs = hops.map((hop) =>
    anthropicCost(hop.model, hop.input, hop.output),
  )

  return {
    provider: 'anthropic',
    model: response.model,
    inputTokens: hops.reduce((n, hop) => n + hop.input, 0),
    outputTokens: hops.reduce((n, hop) => n + hop.output, 0),
    costUsd: costs.some((c) => c === null)
      ? null
      : costs.reduce<number>((n, c) => n + (c ?? 0), 0),
    text: response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n'),
    calls: response.content.flatMap((block) =>
      block.type === 'tool_use'
        ? [{ id: block.id, name: block.name, args: block.input }]
        : [],
    ),
    raw: response.content,
  }
}

// ---- Time --------------------------------------------------------------------

/** "Thursday, 12/11/2026, 14:05" in `timeZone`. */
export function localTime(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
}

/** The instant of a local wall-clock time (`YYYY-MM-DD[THH:mm]`) in
 * `timeZone`. A day alone lands at `defaultHour`. */
export function zonedTime(
  local: string,
  timeZone: string,
  defaultHour: number,
) {
  const [date, time] = local.split('T')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time
    ? time.slice(0, 5).split(':').map(Number)
    : [defaultHour, 0]
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  // Shift by the zone's offset at that moment; twice for DST edges.
  let instant = wall
  for (let i = 0; i < 2; i++) instant = wall - offsetMs(instant, timeZone)
  const result = new Date(instant)
  if (Number.isNaN(result.getTime())) throw new Error(`Bad date: ${local}`)
  return result
}

/** How far `timeZone`'s wall clock is ahead of UTC at `instant`. */
function offsetMs(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asUtc - Math.floor(instant / 1000) * 1000
}
