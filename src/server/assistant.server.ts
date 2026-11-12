import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import type { AssistantInput } from '@/lib/assistant'
import { MAX_REMIND_MINUTES } from '@/lib/tasks/schemas'
import { readSettings } from './settings.server'

// Server-only: the LLM call behind the assistant. Two providers (Settings ›
// Provider): any OpenAI-compatible chat completions API (OpenRouter by
// default, plain fetch) or Anthropic's own API (the official SDK). Off
// unless an API key is set. It only reads the sentence and returns what to
// create / open plus what the call cost; assistant.functions.ts acts on it
// and logs it.

export type LlmProvider = 'openai' | 'anthropic'

const OPENROUTER = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL: Record<LlmProvider, string> = {
  openai: 'anthropic/claude-haiku-5.5',
  anthropic: 'claude-opus-5-5',
}

type LlmConfig = {
  provider: LlmProvider
  key: string
  baseUrl: string
  model: string
}

async function llmConfig(): Promise<LlmConfig | null> {
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

// The tools, in a neutral shape: each provider wraps them its own way.
const TOOLS = [
  {
    name: 'create_task',
    description:
      'Create a to-do task. Use for anything to do, buy, call or remember to do, and for anything with a day or time.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Short imperative title, e.g. "Call the dentist", without the date or time.',
        },
        description: {
          type: 'string',
          description: 'Extra details, only if the user gave any.',
        },
        due: {
          type: 'string',
          description:
            "When it's due, in the user's local time: YYYY-MM-DDTHH:mm, or YYYY-MM-DD for a day without a time. Omit if no day or time was mentioned.",
        },
        remind_minutes_before: {
          type: 'integer',
          description:
            'How many minutes before the due time to send the reminder, only if the user asked for an early reminder (e.g. "remind me 15 minutes before" = 15, "a day before" = 1440). Omit otherwise: the reminder then comes at the due time.',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_note',
    description:
      'Save a note: information to keep (facts, ideas, reference lists, codes, quotes). Not for things to do.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title. May be empty.' },
        body: {
          type: 'string',
          description:
            "The note in markdown: the user's words tidied up, not reworded or shortened.",
        },
      },
      required: ['body'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_item',
    description:
      'Find and open something that already exists: a link (bookmark), note, task or folder the user refers to ("open my packing list", "show the dentist task", "go to the GitHub link"). Creates nothing.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A few distinctive words from its title (or URL), e.g. "dentist" or "github". All of them must appear in it, so keep it short.',
        },
        app: {
          type: 'string',
          enum: ['bookmarks', 'notes', 'tasks'],
          description:
            'Where to look, if the user said: a link/bookmark/site = bookmarks, a note/list = notes, a task/to-do/reminder = tasks. Omit if unsure.',
        },
        folder: {
          type: 'boolean',
          description: 'True if the user asked for a folder.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
]

const taskArgs = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).optional(),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/)
    .optional(),
  remind_minutes_before: z
    .number()
    .int()
    .min(0)
    .max(MAX_REMIND_MINUTES)
    .optional(),
})
const openArgs = z.object({
  query: z.string().trim().min(1).max(200),
  app: z.enum(['bookmarks', 'notes', 'tasks']).optional(),
  folder: z.boolean().optional(),
})
const noteArgs = z.object({
  title: z.string().trim().max(255).optional(),
  body: z.string().trim().min(1).max(500_000),
})

export type PlannedAction =
  | {
      kind: 'task'
      title: string
      description: string
      due?: string
      remindMinutes: number
    }
  | { kind: 'note'; title: string; body: string }
  | {
      kind: 'open'
      query: string
      app?: 'bookmarks' | 'notes' | 'tasks'
      folder: boolean
    }

/** One tool call from the model. */
type ToolCall = { name: string; args: unknown }

/** What a model call cost and returned. */
export type ModelUsage = {
  provider: LlmProvider
  model: string
  inputTokens: number | null
  outputTokens: number | null
  /** US dollars; null when unknown (no price for the model / provider). */
  costUsd: number | null
}

type ModelReply = ModelUsage & { calls: Array<ToolCall>; text: string }

const completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
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

/** Any OpenAI-compatible chat completions API (OpenRouter by default). */
async function callOpenAi(
  config: LlmConfig,
  system: string,
  text: string,
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
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      tools: TOOLS.map((tool) => ({ type: 'function', function: tool })),
      // Not 'required': the newest Claude models reject a forced tool call.
      // The prompt asks for one instead.
      tool_choice: 'auto',
      // OpenRouter reports the request's cost in `usage.cost`.
      ...(openRouter && { usage: { include: true } }),
    }),
    signal: AbortSignal.timeout(60_000),
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
    calls: (message.tool_calls ?? []).flatMap((call) => {
      try {
        return [
          {
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

/** Anthropic's own API (Messages), through the official SDK. */
async function callAnthropic(
  config: LlmConfig,
  system: string,
  text: string,
): Promise<ModelReply> {
  const client = new Anthropic({ apiKey: config.key, timeout: 60_000 })
  const fallback = TAKES_FALLBACK.test(config.model)
  const response = await client.beta.messages.create({
    model: config.model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: text }],
    // tool_choice stays auto (forcing a call is rejected by the newest
    // models); the prompt asks for a tool call.
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Beta.BetaTool['input_schema'],
    })),
    // A quick parsing job: little thinking needed.
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
        ? [{ name: block.name, args: block.input }]
        : [],
    ),
  }
}

/** "Thursday, 12/11/2026, 14:05" in `timeZone`. */
function localTime(now: Date, timeZone: string) {
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

export type Plan = {
  actions: Array<PlannedAction>
  usage: ModelUsage
  /** The model's own words, if it answered without (or besides) tools. */
  text: string
}

/** Asks the LLM what to create / open from the sentence. Throws only when
 * the call itself fails; an answer without actions comes back empty. */
export async function planActions({
  text,
  now,
  timeZone,
}: AssistantInput): Promise<Plan> {
  const config = await llmConfig()
  if (!config) {
    throw new Error('The assistant is off: add an API key in Settings')
  }

  const system = [
    'You turn what the user says (often dictated, so forgive odd wording) into tasks and notes, or open things they already have, by calling the tools. Always answer by calling at least one tool, never with text alone; call them several times if they mention several separate things.',
    'A task is one thing to do; a note is information to keep. "Remind me…" is always a task.',
    'A list of items (shopping, packing, groceries, ideas, things to bring or buy, several things under one topic) is ONE note, never several tasks: give it a short title and write the items as a markdown checklist, one "- [ ] item" per line. Separate unrelated actions ("call the dentist and pay the bill") are separate tasks.',
    'When they ask to open, show, find or go to something ("open…", "show me…", "where is…"), call open_item instead of creating anything.',
    `The user's local time is ${localTime(new Date(now), timeZone)} (day/month/year, ${timeZone}). Resolve relative dates ("tomorrow", "Friday", "in 2 hours", "tonight") against it and give due times in that local time. A weekday means the next one to come.`,
    "Keep titles short and in the user's language. Never invent details.",
  ].join('\n')

  const reply =
    config.provider === 'anthropic'
      ? await callAnthropic(config, system, text)
      : await callOpenAi(config, system, text)

  const actions: Array<PlannedAction> = []
  for (const { name, args } of reply.calls) {
    if (name === 'create_task') {
      const parsed = taskArgs.safeParse(args)
      if (parsed.success) {
        actions.push({
          kind: 'task',
          title: parsed.data.title,
          description: parsed.data.description?.trim() ?? '',
          due: parsed.data.due,
          remindMinutes: parsed.data.remind_minutes_before ?? 0,
        })
      }
    } else if (name === 'open_item') {
      const parsed = openArgs.safeParse(args)
      if (parsed.success) {
        actions.push({
          kind: 'open',
          query: parsed.data.query,
          app: parsed.data.app,
          folder: parsed.data.folder ?? false,
        })
      }
    } else if (name === 'create_note') {
      const parsed = noteArgs.safeParse(args)
      if (parsed.success) {
        actions.push({
          kind: 'note',
          title: parsed.data.title ?? '',
          body: parsed.data.body,
        })
      }
    }
  }
  const { calls: _calls, text: said, ...usage } = reply
  return { actions, usage, text: said }
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
