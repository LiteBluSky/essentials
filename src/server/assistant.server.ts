import { z } from 'zod'

import type { AssistantInput } from '@/lib/assistant'
import { MAX_REMIND_MINUTES } from '@/lib/tasks/schemas'
import { readSettings } from './settings.server'

// Server-only: the LLM call behind the assistant. Any OpenAI-compatible chat
// completions API with tool calling (OpenRouter by default). Off unless
// LLM_API_KEY is set (Settings…, or the env). It only reads the sentence and returns what to create;
// assistant.functions.ts creates it.

const OPENROUTER = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5'

async function llmConfig() {
  const settings = await readSettings()
  if (!settings.LLM_API_KEY) return null
  return {
    key: settings.LLM_API_KEY,
    baseUrl: (settings.LLM_BASE_URL || OPENROUTER).replace(/\/+$/, ''),
    model: settings.LLM_MODEL || DEFAULT_MODEL,
  }
}

export async function assistantConfigured() {
  return (await llmConfig()) !== null
}

const TOOLS = [
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
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
  },
  {
    type: 'function',
    function: {
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

const completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
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
})

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

/** Asks the LLM what to create from the sentence. */
export async function planActions({
  text,
  now,
  timeZone,
}: AssistantInput): Promise<Array<PlannedAction>> {
  const config = await llmConfig()
  if (!config) {
    throw new Error('The assistant is off: add an API key in Settings')
  }

  const system = [
    'You turn what the user says (often dictated, so forgive odd wording) into tasks and notes, or open things they already have, by calling the tools. Always call at least one tool; call them several times if they mention several separate things.',
    'A task is one thing to do; a note is information to keep. "Remind me…" is always a task.',
    'A list of items (shopping, packing, groceries, ideas, things to bring or buy, several things under one topic) is ONE note, never several tasks: give it a short title and write the items as a markdown checklist, one "- [ ] item" per line. Separate unrelated actions ("call the dentist and pay the bill") are separate tasks.',
    'When they ask to open, show, find or go to something ("open…", "show me…", "where is…"), call open_item instead of creating anything.',
    `The user's local time is ${localTime(new Date(now), timeZone)} (day/month/year, ${timeZone}). Resolve relative dates ("tomorrow", "Friday", "in 2 hours", "tonight") against it and give due times in that local time. A weekday means the next one to come.`,
    "Keep titles short and in the user's language. Never invent details.",
  ].join('\n')

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
      tools: TOOLS,
      tool_choice: 'required',
      temperature: 0,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`The LLM answered ${res.status}: ${detail}`)
  }
  const { message } = completion.parse(await res.json()).choices[0]

  const actions: Array<PlannedAction> = []
  for (const call of message.tool_calls ?? []) {
    let args: unknown
    try {
      args = JSON.parse(call.function.arguments || '{}')
    } catch {
      continue
    }
    if (call.function.name === 'create_task') {
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
    } else if (call.function.name === 'open_item') {
      const parsed = openArgs.safeParse(args)
      if (parsed.success) {
        actions.push({
          kind: 'open',
          query: parsed.data.query,
          app: parsed.data.app,
          folder: parsed.data.folder ?? false,
        })
      }
    } else if (call.function.name === 'create_note') {
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
  if (!actions.length) {
    throw new Error(
      "Couldn't make a task or note of that, or find what to open",
    )
  }
  return actions
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
