import { z } from 'zod'

import type { SearchApp, SearchResult } from '@/lib/global-search'

// The assistant ("Tell me…" field on every app): a sentence goes to an LLM
// (OpenRouter or any OpenAI-compatible API, see assistant.server.ts), which
// turns it into tasks and/or notes, or finds something to open (through the
// global search). Everything it creates lands in the top-level "Unsorted"
// folder of its app, to be filed by hand.

export const UNSORTED_FOLDER = 'Unsorted'

export const assistantInput = z.object({
  text: z.string().trim().min(1, 'Say something').max(2000, 'Keep it shorter'),
  /** The browser's clock and timezone, to read "tomorrow at 3". */
  now: z.iso.datetime(),
  timeZone: z.string().min(1).max(100),
})
export type AssistantInput = z.infer<typeof assistantInput>

/** What was created. */
export type AssistantItem =
  | { app: 'tasks'; id: number; title: string; dueAt: Date | null }
  | { app: 'notes'; id: number; title: string }

/** Something asked for ("open my packing list") and the best match, if any. */
export type AssistantFound = {
  query: string
  match: (SearchResult & { app: SearchApp }) | null
}

/** A change the assistant made to something that existed (or a folder /
 * bookmark it created), for messages and Undo. */
export type ChangeSummary = {
  app: 'bookmarks' | 'notes' | 'tasks' | 'contacts'
  target: 'item' | 'folder'
  op: 'create' | 'update' | 'delete'
  id: number
  label: string
  /** What happened, in a few words ("renamed", "moved to Work", "done"). */
  detail?: string
}

export type AssistantResult = {
  created: Array<AssistantItem>
  found: Array<AssistantFound>
  changed: Array<ChangeSummary>
  /** The run's id when it changed anything (its Undo). */
  runId?: string | null
  /** The model's own reply, if any. */
  answer?: string
}
