import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'

import { UNSORTED_FOLDER, assistantInput } from '@/lib/assistant'
import type {
  AssistantFound,
  AssistantItem,
  AssistantResult,
} from '@/lib/assistant'
import type { SearchApp } from '@/lib/global-search'
import { DEFAULT_DUE_HOUR } from '@/lib/tasks/tree'
import {
  assistantConfigured,
  currentModel,
  planActions,
  zonedTime,
} from './assistant.server'
import type { ModelUsage } from './assistant.server'
import { clearHistory, loadHistory, logRequest } from './assistant-log.server'
import { ensureTopFolder as ensureNoteFolder, insertNote } from './notes.server'
import { ensureTopFolder as ensureTaskFolder, insertTask } from './tasks.server'
import { search } from './search.server'

// The assistant ("Tell me…"), shared by every app. No auth by design (see
// CLAUDE.md).

/** Whether the field is shown (LLM_API_KEY set); never exposes the key. */
export const getAssistantEnabled = createServerFn({ method: 'GET' }).handler(
  () => assistantConfigured(),
)

/** Prefetched by each app's loader; fixed while the server runs. */
export const assistantEnabledQueryOptions = queryOptions({
  queryKey: ['assistant', 'enabled'],
  queryFn: () => getAssistantEnabled(),
  staleTime: Infinity,
})

const ALL_APPS: Array<SearchApp> = ['tasks', 'notes', 'bookmarks']

/** The best match for `query` (via the global search): in `app` if given,
 * an item unless a folder was asked for, whose name has every word first
 * (then the search's own order: most recently edited). */
async function findOne(
  query: string,
  app: SearchApp | undefined,
  folder: boolean,
): Promise<AssistantFound> {
  const results = await search(query)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const wanted = folder ? 'folder' : 'item'
  const score = (r: { kind: string; label: string }) =>
    (words.every((w) => r.label.toLowerCase().includes(w)) ? 0 : 2) +
    (r.kind === wanted ? 0 : 1)
  const pool = (app ? [app] : ALL_APPS)
    .flatMap((a) => results[a].map((r) => ({ ...r, app: a })))
    .sort((a, b) => score(a) - score(b))
  return { query, match: pool.at(0) ?? null }
}

/** Reads the sentence, creates its tasks / notes in "Unsorted" and finds
 * what it asks to open. Every request is logged (assistant history), with
 * what it cost, whether it worked or not. */
export const askAssistant = createServerFn({ method: 'POST' })
  .validator(assistantInput)
  .handler(async ({ data }): Promise<AssistantResult> => {
    const started = Date.now()
    let usage: ModelUsage | null = null
    try {
      const plan = await planActions(data)
      usage = plan.usage
      if (!plan.actions.length) {
        throw new Error(
          plan.text.trim()
            ? `No task, note or search came of that. The model said: ${plan.text.trim().slice(0, 300)}`
            : "Couldn't make a task or note of that, or find what to open",
        )
      }
      const result = await runActions(plan.actions, data.timeZone)
      await logRequest({
        text: data.text,
        ...usage,
        ok: true,
        result: describe(result),
        durationMs: Date.now() - started,
      })
      return result
    } catch (error) {
      const fallback = usage ?? (await currentModel())
      await logRequest({
        text: data.text,
        provider: fallback?.provider ?? '',
        model: fallback?.model ?? '',
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        costUsd: usage?.costUsd ?? null,
        ok: false,
        result: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      })
      throw error
    }
  })

/** One line per thing done, for the history. */
function describe({ created, found }: AssistantResult) {
  return [
    ...created.map((item) =>
      item.app === 'tasks'
        ? `Task: ${item.title}${item.dueAt ? ` (due ${item.dueAt.toISOString()})` : ''}`
        : `Note: ${item.title.split('\n')[0]}`,
    ),
    ...found.map(({ query, match }) =>
      match ? `Opened: ${match.label} (${match.app})` : `Not found: ${query}`,
    ),
  ].join('\n')
}

/** Creates the tasks / notes and finds what to open. */
async function runActions(
  actions: Awaited<ReturnType<typeof planActions>>['actions'],
  timeZone: string,
): Promise<AssistantResult> {
  const items: Array<AssistantItem> = []
  const found: Array<AssistantFound> = []
  for (const action of actions) {
    if (action.kind === 'open') {
      found.push(await findOne(action.query, action.app, action.folder))
    } else if (action.kind === 'task') {
      const dueAt = action.due
        ? zonedTime(action.due, timeZone, DEFAULT_DUE_HOUR)
        : null
      const folderId = await ensureTaskFolder(UNSORTED_FOLDER)
      const { id } = await insertTask({
        title: action.title,
        description: action.description,
        folderId,
        dueAt,
        remindMinutes: action.remindMinutes,
      })
      items.push({ app: 'tasks', id, title: action.title, dueAt })
    } else {
      const folderId = await ensureNoteFolder(UNSORTED_FOLDER)
      const { id } = await insertNote({
        title: action.title,
        body: action.body,
        folderId,
      })
      items.push({ app: 'notes', id, title: action.title || action.body })
    }
  }
  return { created: items, found }
}

/** The assistant history: the latest requests and totals over all of them. */
export const getAssistantHistory = createServerFn({ method: 'GET' }).handler(
  () => loadHistory(),
)

export const assistantHistoryQueryOptions = queryOptions({
  queryKey: ['assistant', 'history'],
  queryFn: () => getAssistantHistory(),
})

export const clearAssistantHistory = createServerFn({
  method: 'POST',
}).handler(async () => {
  await clearHistory()
})
