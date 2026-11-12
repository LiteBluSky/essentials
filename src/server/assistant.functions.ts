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
import { assistantConfigured, planActions, zonedTime } from './assistant.server'
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
 * what it asks to open. */
export const askAssistant = createServerFn({ method: 'POST' })
  .validator(assistantInput)
  .handler(async ({ data }): Promise<AssistantResult> => {
    const actions = await planActions(data)
    const items: Array<AssistantItem> = []
    const found: Array<AssistantFound> = []
    for (const action of actions) {
      if (action.kind === 'open') {
        found.push(await findOne(action.query, action.app, action.folder))
      } else if (action.kind === 'task') {
        const dueAt = action.due
          ? zonedTime(action.due, data.timeZone, DEFAULT_DUE_HOUR)
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
  })
