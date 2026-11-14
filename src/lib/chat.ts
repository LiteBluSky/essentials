import { z } from 'zod'

import type { ChatMessage } from '@/db/schema'
import type { AssistantResult } from '@/lib/assistant'
import { ASSISTANT_NAME } from '@/lib/assistant'

// The Chat app: ask about anything stored (bookmarks, notes, tasks), and have
// it create tasks / notes or open items. See chat.server.ts.

/** Conversations are deleted this many days after their last message
 * (lazily, whenever the list loads). */
export const CHAT_TTL_DAYS = 7

/** A conversation last active before this is past keeping. */
export function chatCutoff(now = Date.now()) {
  return new Date(now - CHAT_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export const chatInput = z.object({
  /** null = start a new conversation. */
  conversationId: z.number().int().positive().nullable(),
  text: z.string().trim().min(1, 'Say something').max(8000, 'Keep it shorter'),
  /** The browser's clock and timezone, for "today", "this week", due dates. */
  now: z.iso.datetime(),
  timeZone: z.string().min(1).max(100),
  /** Let Jarvis search the web for this one request (off by default). */
  webSearch: z.boolean().default(false),
})
export type ChatInput = z.infer<typeof chatInput>

/** A saved message, and whether its changes can still be undone. */
export type ChatMessageView = ChatMessage & { undoable: boolean }

export type ChatTurnResult = {
  conversationId: number
  message: ChatMessageView
  result: AssistantResult
}

/** What a turn streams (`/api/chat`, one JSON object per line) while it
 * runs: the answer's text as it's written, `step` when that text was just a
 * lead-in to tool calls (dropped: the answer is the last step's text), each
 * tool as it's used, then `done` (or `error`). */
export type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'step' }
  | { type: 'tool'; name: string }
  | { type: 'done'; conversationId: number; apps: Array<string> }
  | { type: 'error'; message: string }

/** The query key root to refresh after a turn changed `app` (recurring
 * money and budgets live in Finances' data). */
export function refreshKey(app: string) {
  return app === 'subscriptions' || app === 'budgets' ? 'finances' : app
}

/** "Jarvis is reading…": what the turn is doing, while there's no text. */
export function toolActivity(name: string | null) {
  const verb =
    name === null
      ? 'thinking'
      : name === 'search' || name === 'open_item'
        ? 'searching'
        : name.startsWith('read_')
          ? 'reading'
          : name.startsWith('list_')
            ? 'looking it up'
            : /^(create|add)_/.test(name)
              ? 'adding'
              : /^(update|set)_/.test(name)
                ? 'making changes'
                : name.startsWith('delete_')
                  ? 'deleting'
                  : name === 'use_database'
                    ? 'switching profile'
                    : 'working'
  return `${ASSISTANT_NAME} is ${verb}…`
}

/** A saved message's `actions` (what the turn created / found), parsed. */
export function messageActions(message: ChatMessage): AssistantResult | null {
  if (!message.actions) return null
  try {
    const parsed = JSON.parse(message.actions, (key, value: unknown) =>
      key === 'dueAt' && typeof value === 'string' ? new Date(value) : value,
    ) as Partial<AssistantResult>
    // Messages saved before edits existed have no `changed`.
    return {
      created: parsed.created ?? [],
      found: parsed.found ?? [],
      changed: parsed.changed ?? [],
    }
  } catch {
    return null
  }
}
