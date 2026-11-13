import { z } from 'zod'

import type { SearchApp, SearchResult } from '@/lib/global-search'

/** What the assistant is called (in the UI and its prompt); the user can
 * address it by this name. */
export const ASSISTANT_NAME = 'Jarvis'

// The assistant ("Ask Jarvis…" field on every app): a sentence goes to an LLM
// (OpenRouter or any OpenAI-compatible API, see assistant.server.ts), which
// turns it into tasks and/or notes, or finds something to open (through the
// global search). What it creates is filed in a fitting folder (existing
// first, else a new one); the top-level "Unsorted" folder when none fits.

export const UNSORTED_FOLDER = 'Unsorted'

export const assistantInput = z.object({
  text: z.string().trim().min(1, 'Say something').max(2000, 'Keep it shorter'),
  /** The browser's clock and timezone, to read "tomorrow at 3". */
  now: z.iso.datetime(),
  timeZone: z.string().min(1).max(100),
  /** Let Jarvis search the web for this one request (off by default). */
  webSearch: z.boolean().default(false),
})
export type AssistantInput = z.infer<typeof assistantInput>

/** What was created. */
export type AssistantItem = (
  | { app: 'tasks'; id: number; title: string; dueAt: Date | null }
  | { app: 'notes'; id: number; title: string }
) & {
  /** The folder path it was filed in; unset = "Unsorted". */
  folder?: string
  /** The profile it was made in, when not the one in use (no Open then). */
  database?: string
}

/** Something asked for ("open my packing list") and the best match, if any. */
export type AssistantFound = {
  query: string
  match: (SearchResult & { app: SearchApp }) | null
  /** The profile it was found in, when not the one in use. */
  database?: string
}

/** A change the assistant made to something that existed (or a folder /
 * bookmark it created), for messages and Undo. */
export type ChangeSummary = {
  app:
    | 'bookmarks'
    | 'notes'
    | 'tasks'
    | 'contacts'
    | 'calendar'
    | 'finances'
    | 'subscriptions'
    | 'budgets'
  target: 'item' | 'folder'
  op: 'create' | 'update' | 'delete'
  id: number
  label: string
  /** What happened, in a few words ("renamed", "moved to Work", "done"). */
  detail?: string
  /** The profile it happened in, when not the one in use. */
  database?: string
}

export type AssistantResult = {
  created: Array<AssistantItem>
  found: Array<AssistantFound>
  changed: Array<ChangeSummary>
  /** The run's id when it changed anything (its Undo). */
  runId?: string | null
  /** The model's own reply, if any. */
  answer?: string
  /** The Chat conversation an Ask Jarvis request was saved as. */
  conversationId?: number | null
}
