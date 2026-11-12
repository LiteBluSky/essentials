import { z } from 'zod'

import type { AssistantInput } from '@/lib/assistant'
import { MAX_REMIND_MINUTES } from '@/lib/tasks/schemas'
import { callModel, llmConfig, localTime } from './llm.server'
import type { ModelUsage, ToolCall, ToolDef } from './llm.server'

// Server-only: what the Tell me field asks the LLM (llm.server.ts). It only
// reads the sentence and returns what to create / open plus what the call
// cost; assistant.functions.ts acts on it and logs it.

// The tools that create and open things (also offered by the chat).
export const ACTION_TOOLS: Array<ToolDef> = [
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

/** A tool call as an action, or null if it isn't one / is malformed. */
export function toAction({ name, args }: ToolCall): PlannedAction | null {
  if (name === 'create_task') {
    const parsed = taskArgs.safeParse(args)
    return parsed.success
      ? {
          kind: 'task',
          title: parsed.data.title,
          description: parsed.data.description?.trim() ?? '',
          due: parsed.data.due,
          remindMinutes: parsed.data.remind_minutes_before ?? 0,
        }
      : null
  }
  if (name === 'create_note') {
    const parsed = noteArgs.safeParse(args)
    return parsed.success
      ? { kind: 'note', title: parsed.data.title ?? '', body: parsed.data.body }
      : null
  }
  if (name === 'open_item') {
    const parsed = openArgs.safeParse(args)
    return parsed.success
      ? {
          kind: 'open',
          query: parsed.data.query,
          app: parsed.data.app,
          folder: parsed.data.folder ?? false,
        }
      : null
  }
  return null
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

  const {
    calls,
    text: said,
    raw: _raw,
    ...usage
  } = await callModel(config, {
    system,
    turns: [{ role: 'user', text }],
    tools: ACTION_TOOLS,
  })
  const actions = calls
    .map(toAction)
    .filter((action): action is PlannedAction => action !== null)
  return { actions, usage, text: said }
}
