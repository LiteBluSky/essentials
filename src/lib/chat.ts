import { z } from 'zod'

import type { ChatMessage } from '@/db/schema'
import type { AssistantResult } from '@/lib/assistant'

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
})
export type ChatInput = z.infer<typeof chatInput>

/** A saved message, and whether its changes can still be undone. */
export type ChatMessageView = ChatMessage & { undoable: boolean }

export type ChatTurnResult = {
  conversationId: number
  message: ChatMessageView
  result: AssistantResult
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
