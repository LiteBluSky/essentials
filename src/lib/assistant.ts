import { z } from 'zod'

// The assistant ("Tell me…" field on every app): a sentence goes to an LLM
// (OpenRouter or any OpenAI-compatible API, see assistant.server.ts), which
// turns it into tasks and/or notes. Everything it creates lands in the
// top-level "Unsorted" folder of its app, to be filed by hand.

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
