import { z } from 'zod'

import type { ChatMessage } from '@/db/schema'
import type { AssistantResult } from '@/lib/assistant'

// The Chat app: ask about anything stored (bookmarks, notes, tasks), and have
// it create tasks / notes or open items. See chat.server.ts.

export const chatInput = z.object({
  /** null = start a new conversation. */
  conversationId: z.number().int().positive().nullable(),
  text: z.string().trim().min(1, 'Say something').max(8000, 'Keep it shorter'),
  /** The browser's clock and timezone, for "today", "this week", due dates. */
  now: z.iso.datetime(),
  timeZone: z.string().min(1).max(100),
})
export type ChatInput = z.infer<typeof chatInput>

export type ChatTurnResult = {
  conversationId: number
  message: ChatMessage
  result: AssistantResult
}

/** A saved message's `actions` (what the turn created / found), parsed. */
export function messageActions(message: ChatMessage): AssistantResult | null {
  if (!message.actions) return null
  try {
    return JSON.parse(message.actions, (key, value: unknown) =>
      key === 'dueAt' && typeof value === 'string' ? new Date(value) : value,
    ) as AssistantResult
  } catch {
    return null
  }
}
