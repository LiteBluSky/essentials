import { and, asc, desc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import {
  folders as bookmarkFolders,
  chatConversations,
  chatMessages,
  links,
  noteFolders,
  notes,
  taskFolders,
  tasks,
} from '@/db/schema'
import type { AssistantResult } from '@/lib/assistant'
import type { ChatInput, ChatTurnResult } from '@/lib/chat'
import { remindLabel } from '@/lib/tasks/tree'
import { ACTION_TOOLS, toAction } from './assistant.server'
import { describe, runAction } from './assistant-actions.server'
import { logRequest } from './assistant-log.server'
import {
  addUsage,
  callModel,
  currentModel,
  llmConfig,
  localTime,
  zonedTime,
} from './llm.server'
import type { ModelUsage, ToolDef, Turn } from './llm.server'
import { search } from './search.server'

// Server-only: the Chat app. Each message runs a small tool loop: the model
// looks things up (search, read_item, list_tasks), may create tasks / notes
// or open items (the Tell me tools), and answers. It never edits or deletes
// what exists. Conversations and messages are saved; every turn is logged
// in the assistant history with its cost. Only import from
// chat.functions.ts.

/** At most this many model calls per message (look-ups + the answer). */
const MAX_STEPS = 8
/** Earlier messages sent along for context. */
const HISTORY_MESSAGES = 30
/** Caps on what a tool hands back, so a long note can't flood the model. */
const MAX_BODY_CHARS = 20_000
const MAX_RESULT_CHARS = 40_000

const LOOKUP_TOOLS: Array<ToolDef> = [
  {
    name: 'search',
    description:
      "Search the user's bookmarks (links), notes and tasks, and their folders. Every word must appear in the title, URL, description, note text or task description, so use one or two distinctive words and try other words or synonyms if nothing comes back. An empty query lists the most recently edited. Returns ids to use with read_item.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'One or two keywords.' },
        app: {
          type: 'string',
          enum: ['bookmarks', 'notes', 'tasks'],
          description: 'Only look in this app. Omit to search all three.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_item',
    description:
      'Read one bookmark, note or task in full (note text, task description and dates, link URL and description), by the id from search or list_tasks.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: ['bookmarks', 'notes', 'tasks'] },
        id: { type: 'integer' },
      },
      required: ['app', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_tasks',
    description:
      "List tasks by status and due date, e.g. what is open, overdue, due this week, or done. Dates are the user's local days (YYYY-MM-DD). Tasks without a due date are listed only when no date range is given.",
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'done', 'all'],
          description: 'Default: open.',
        },
        due_from: {
          type: 'string',
          description: 'First local day (inclusive), YYYY-MM-DD.',
        },
        due_to: {
          type: 'string',
          description: 'Last local day (inclusive), YYYY-MM-DD.',
        },
      },
      additionalProperties: false,
    },
  },
]

const TOOLS = [...LOOKUP_TOOLS, ...ACTION_TOOLS]

const appArg = z.enum(['bookmarks', 'notes', 'tasks'])
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const searchArgs = z.object({
  query: z.string().max(200).default(''),
  app: appArg.optional(),
})
const readArgs = z.object({ app: appArg, id: z.number().int().positive() })
const listArgs = z.object({
  status: z.enum(['open', 'done', 'all']).default('open'),
  due_from: day.optional(),
  due_to: day.optional(),
})

type FolderTable =
  typeof bookmarkFolders | typeof noteFolders | typeof taskFolders

/** "A / B" for a folder id, from the app's folders. */
async function pathOf(table: FolderTable, folderId: number | null) {
  if (folderId === null) return ''
  const rows = await db
    .select({ id: table.id, name: table.name, parentId: table.parentId })
    .from(table)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const names: Array<string> = []
  let current: number | null = folderId
  while (current !== null && names.length < 50) {
    const folder = byId.get(current)
    if (!folder) break
    names.unshift(folder.name)
    current = folder.parentId
  }
  return names.join(' / ')
}

/** "2026-11-13 15:00" in the user's timezone. */
function local(date: Date | null, timeZone: string) {
  if (!date) return null
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

async function readItem(
  { app, id }: z.infer<typeof readArgs>,
  timeZone: string,
) {
  if (app === 'notes') {
    const note = (await db.select().from(notes).where(eq(notes.id, id))).at(0)
    if (!note) return { error: 'No note with that id' }
    return {
      app,
      id,
      title: note.title,
      folder: await pathOf(noteFolders, note.folderId),
      body:
        note.body.length > MAX_BODY_CHARS
          ? `${note.body.slice(0, MAX_BODY_CHARS)}… (cut short)`
          : note.body,
      edited: local(note.updatedAt, timeZone),
    }
  }
  if (app === 'tasks') {
    const task = (await db.select().from(tasks).where(eq(tasks.id, id))).at(0)
    if (!task) return { error: 'No task with that id' }
    return {
      app,
      id,
      title: task.title,
      folder: await pathOf(taskFolders, task.folderId),
      description: task.description,
      created: local(task.createdAt, timeZone),
      due: local(task.dueAt, timeZone),
      reminder: task.dueAt ? remindLabel(task.remindMinutes) : null,
      done: local(task.completedAt, timeZone),
    }
  }
  const link = (await db.select().from(links).where(eq(links.id, id))).at(0)
  if (!link) return { error: 'No bookmark with that id' }
  return {
    app,
    id,
    title: link.title,
    url: link.url,
    description: link.description ?? '',
    folder: await pathOf(bookmarkFolders, link.folderId),
    favourite: link.favoritePosition !== null,
  }
}

async function listTasks(
  { status, due_from, due_to }: z.infer<typeof listArgs>,
  timeZone: string,
) {
  const conditions = [
    status === 'open'
      ? isNull(tasks.completedAt)
      : status === 'done'
        ? isNotNull(tasks.completedAt)
        : undefined,
    due_from ? gte(tasks.dueAt, zonedTime(due_from, timeZone, 0)) : undefined,
    due_to
      ? lt(
          tasks.dueAt,
          new Date(zonedTime(due_to, timeZone, 0).getTime() + 86_400_000),
        )
      : undefined,
  ]
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt))
    .limit(100)
  return Promise.all(
    rows.map(async (task) => ({
      id: task.id,
      title: task.title,
      folder: await pathOf(taskFolders, task.folderId),
      due: local(task.dueAt, timeZone),
      done: task.completedAt !== null,
      created: local(task.createdAt, timeZone),
    })),
  )
}

/** Runs one tool call; returns what goes back to the model (JSON). */
async function runTool(
  name: string,
  args: unknown,
  timeZone: string,
  result: AssistantResult,
): Promise<unknown> {
  if (name === 'search') {
    const parsed = searchArgs.safeParse(args)
    if (!parsed.success) return { error: 'Bad arguments' }
    const found = await search(parsed.data.query)
    const apps = parsed.data.app
      ? [parsed.data.app]
      : (['bookmarks', 'notes', 'tasks'] as const)
    return Object.fromEntries(apps.map((app) => [app, found[app]]))
  }
  if (name === 'read_item') {
    const parsed = readArgs.safeParse(args)
    return parsed.success
      ? readItem(parsed.data, timeZone)
      : { error: 'Bad arguments' }
  }
  if (name === 'list_tasks') {
    const parsed = listArgs.safeParse(args ?? {})
    return parsed.success
      ? listTasks(parsed.data, timeZone)
      : { error: 'Bad arguments' }
  }
  const action = toAction({ id: '', name, args })
  if (!action) return { error: `Unknown tool or bad arguments: ${name}` }
  const done = await runAction(action, timeZone, result)
  if ('query' in done) {
    return done.match
      ? {
          shown_to_user: true,
          match: {
            app: done.match.app,
            id: done.match.id,
            title: done.match.label,
          },
        }
      : { error: 'Nothing matched', query: done.query }
  }
  return { created: { app: done.app, id: done.id, title: done.title } }
}

function systemPrompt(now: string, timeZone: string) {
  return [
    "You are the assistant inside the user's personal app, which has three parts: Bookmarks (saved links in folders), Notes (markdown notes in folders) and Tasks (to-dos in folders, with optional due dates and reminders).",
    'Answer questions about what is stored by looking it up with the tools first (search, read_item, list_tasks). Never guess or invent stored content: if nothing is found, say so, and mention what you searched for. Read an item before quoting or summarising it.',
    'You can also create tasks and notes (they go to the "Unsorted" folder) and open items for the user (open_item shows them an Open button), but only when they ask for it. A list of items (shopping, packing…) is one note with a "- [ ] item" checklist. You cannot edit, move, complete or delete existing items; say so if asked.',
    `The user's local time is ${localTime(new Date(now), timeZone)} (day/month/year, ${timeZone}). Use it for "today", "this week", "overdue" and for due dates.`,
    "Answer briefly, in the user's language, in markdown. When you mention a stored item, give its title (and folder if it helps).",
  ].join('\n')
}

/** The saved messages of a conversation, oldest first. */
export async function loadMessages(conversationId: number) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
}

export async function listConversations() {
  return db
    .select()
    .from(chatConversations)
    .orderBy(desc(chatConversations.updatedAt), desc(chatConversations.id))
}

export async function removeConversation(id: number) {
  await db.transaction(async (tx) => {
    await tx.delete(chatMessages).where(eq(chatMessages.conversationId, id))
    await tx.delete(chatConversations).where(eq(chatConversations.id, id))
  })
}

/** The conversation's title: the start of its first message. */
function titleFrom(text: string) {
  const line = text.trim().split('\n')[0]
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

/**
 * Sends a message: saves it (starting a conversation if needed), runs the
 * tool loop and saves the answer (or the error) with what was created /
 * found. Every turn is logged with its cost.
 */
export async function sendMessage(input: ChatInput): Promise<ChatTurnResult> {
  const started = Date.now()
  const config = await llmConfig()
  if (!config)
    throw new Error('The assistant is off: add an API key in Settings')

  let conversationId = input.conversationId
  if (conversationId !== null) {
    const exists = (
      await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
    ).at(0)
    if (!exists) throw new Error('Conversation not found')
  } else {
    const [row] = await db
      .insert(chatConversations)
      .values({ title: titleFrom(input.text) })
      .returning({ id: chatConversations.id })
    conversationId = row.id
  }

  const earlier = (await loadMessages(conversationId))
    .filter((m) => !m.error)
    .slice(-HISTORY_MESSAGES)
  await db
    .insert(chatMessages)
    .values({ conversationId, role: 'user', content: input.text })

  const turns: Array<Turn> = [
    ...earlier.map((m): Turn =>
      m.role === 'user'
        ? { role: 'user', text: m.content }
        : { role: 'assistant', text: m.content, calls: [] },
    ),
    { role: 'user', text: input.text },
  ]
  const result: AssistantResult = { created: [], found: [] }
  let usage: ModelUsage | null = null
  let answer = ''
  let error: string | null = null

  try {
    const system = systemPrompt(input.now, input.timeZone)
    for (let step = 0; ; step++) {
      const reply = await callModel(config, { system, turns, tools: TOOLS })
      const { calls, text, raw, ...cost } = reply
      usage = addUsage(usage, cost)
      if (!calls.length) {
        answer = text.trim()
        break
      }
      if (step === MAX_STEPS - 1) {
        answer =
          text.trim() ||
          "I couldn't finish looking that up. Try asking more specifically."
        break
      }
      turns.push({ role: 'assistant', text, calls, raw })
      const results = []
      for (const call of calls) {
        let output: unknown
        try {
          output = await runTool(call.name, call.args, input.timeZone, result)
        } catch (toolError) {
          output = {
            error:
              toolError instanceof Error
                ? toolError.message
                : String(toolError),
          }
        }
        const content = JSON.stringify(output)
        results.push({
          id: call.id,
          content:
            content.length > MAX_RESULT_CHARS
              ? `${content.slice(0, MAX_RESULT_CHARS)}… (cut short)`
              : content,
        })
      }
      turns.push({ role: 'tool', results })
    }
    if (!answer) answer = describe(result) || 'Done.'
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  const actions =
    result.created.length || result.found.length ? JSON.stringify(result) : null
  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      role: 'assistant',
      content: error ?? answer,
      actions,
      error: error !== null,
    })
    .returning()
  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId))

  const model = usage ?? (await currentModel())
  await logRequest({
    text: input.text,
    source: 'chat',
    provider: model?.provider ?? '',
    model: model?.model ?? '',
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    costUsd: usage?.costUsd ?? null,
    ok: error === null,
    result:
      error ??
      [answer.slice(0, 300), describe(result)].filter(Boolean).join('\n'),
    durationMs: Date.now() - started,
  })

  return { conversationId, message, result }
}
